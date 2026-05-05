
-- ENUMS
CREATE TYPE public.server_role AS ENUM ('admin', 'moderator', 'member');
CREATE TYPE public.user_status AS ENUM ('online', 'idle', 'offline');
CREATE TYPE public.channel_type AS ENUM ('text', 'voice');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  status public.user_status NOT NULL DEFAULT 'offline',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- SERVERS
CREATE TABLE public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon_url TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

-- SERVER MEMBERS
CREATE TABLE public.server_members (
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.server_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id)
);
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helpers (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_server_member(_server_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = _server_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.get_server_role(_server_id UUID, _user_id UUID)
RETURNS public.server_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.server_members WHERE server_id = _server_id AND user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.has_server_role(_server_id UUID, _user_id UUID, _role public.server_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = _server_id AND user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_server_staff(_server_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = _server_id AND user_id = _user_id AND role IN ('admin','moderator'));
$$;

-- Servers policies
CREATE POLICY "Members can view their servers"
  ON public.servers FOR SELECT TO authenticated
  USING (public.is_server_member(id, auth.uid()));
CREATE POLICY "Authenticated can create servers"
  ON public.servers FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Admins can update server"
  ON public.servers FOR UPDATE TO authenticated
  USING (public.has_server_role(id, auth.uid(), 'admin'));
CREATE POLICY "Owner can delete server"
  ON public.servers FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Server members policies
CREATE POLICY "Members can view membership of their servers"
  ON public.server_members FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY "Users can join (insert) themselves"
  ON public.server_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can update member roles"
  ON public.server_members FOR UPDATE TO authenticated
  USING (public.has_server_role(server_id, auth.uid(), 'admin'));
CREATE POLICY "Admins or self can remove members"
  ON public.server_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_server_role(server_id, auth.uid(), 'admin'));

-- Auto-add owner as admin and create #general channel
CREATE OR REPLACE FUNCTION public.handle_new_server()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.server_members (server_id, user_id, role) VALUES (NEW.id, NEW.owner_id, 'admin');
  INSERT INTO public.channels (server_id, name, type, position) VALUES (NEW.id, 'general', 'text', 0);
  RETURN NEW;
END;
$$;

-- CHANNELS
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.channel_type NOT NULL DEFAULT 'text',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view channels"
  ON public.channels FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY "Staff can create channels"
  ON public.channels FOR INSERT TO authenticated
  WITH CHECK (public.is_server_staff(server_id, auth.uid()));
CREATE POLICY "Staff can update channels"
  ON public.channels FOR UPDATE TO authenticated
  USING (public.is_server_staff(server_id, auth.uid()));
CREATE POLICY "Staff can delete channels"
  ON public.channels FOR DELETE TO authenticated
  USING (public.is_server_staff(server_id, auth.uid()));

CREATE TRIGGER on_server_created
  AFTER INSERT ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_server();

-- DM CONVERSATIONS
CREATE TABLE public.dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dm_user_order CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);
ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_dm_participant(_dm_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.dm_conversations WHERE id = _dm_id AND (_user_id = user_a OR _user_id = user_b));
$$;

CREATE POLICY "Participants can view DM"
  ON public.dm_conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "Participants can create DM"
  ON public.dm_conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- MESSAGES (channel OR dm)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  dm_id UUID REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  attachment_url TEXT,
  attachment_type TEXT,
  pinned BOOLEAN NOT NULL DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT msg_target_one CHECK (
    (channel_id IS NOT NULL AND dm_id IS NULL) OR (channel_id IS NULL AND dm_id IS NOT NULL)
  )
);
CREATE INDEX idx_messages_channel ON public.messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_dm ON public.messages(dm_id, created_at DESC);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_message(_channel_id UUID, _dm_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE
      WHEN _channel_id IS NOT NULL THEN EXISTS (
        SELECT 1 FROM public.channels c
        WHERE c.id = _channel_id AND public.is_server_member(c.server_id, _user_id)
      )
      WHEN _dm_id IS NOT NULL THEN public.is_dm_participant(_dm_id, _user_id)
      ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_message(_channel_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = _channel_id AND public.is_server_staff(c.server_id, _user_id)
  );
$$;

CREATE POLICY "View messages if member/participant"
  ON public.messages FOR SELECT TO authenticated
  USING (public.can_view_message(channel_id, dm_id, auth.uid()));
CREATE POLICY "Insert messages if member/participant and self"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_view_message(channel_id, dm_id, auth.uid()));
CREATE POLICY "Author can update own messages, staff can pin"
  ON public.messages FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate_message(channel_id, auth.uid()));
CREATE POLICY "Author or staff can delete"
  ON public.messages FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate_message(channel_id, auth.uid()));

-- REACTIONS
CREATE TABLE public.reactions (
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View reactions if can view message"
  ON public.reactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND public.can_view_message(m.channel_id, m.dm_id, auth.uid())
  ));
CREATE POLICY "React if can view message and self"
  ON public.reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND public.can_view_message(m.channel_id, m.dm_id, auth.uid())
  ));
CREATE POLICY "Remove own reaction"
  ON public.reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- AUTO PROFILE on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  i INT := 0;
BEGIN
  base_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]', '', 'g');
  IF base_username = '' THEN base_username := 'user'; END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    i := i + 1;
    final_username := base_username || i::TEXT;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, final_username, COALESCE(NEW.raw_user_meta_data->>'display_name', final_username));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_touch_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- REALTIME
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.reactions REPLICA IDENTITY FULL;
ALTER TABLE public.channels REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars','avatars',true),
  ('server-icons','server-icons',true),
  ('chat-uploads','chat-uploads',true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT USING (bucket_id IN ('avatars','server-icons','chat-uploads'));
CREATE POLICY "Auth upload avatars" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('avatars','server-icons','chat-uploads'));
CREATE POLICY "Auth update own files" ON storage.objects FOR UPDATE TO authenticated
  USING (auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Auth delete own files" ON storage.objects FOR DELETE TO authenticated
  USING (auth.uid()::text = (storage.foldername(name))[1]);
