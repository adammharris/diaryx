-- Diaryx Tag-Based RBAC Schema (V4 - Neon & Generic Auth Compatible)
-- Changes from V3:
-- 1. Removed all references to Supabase-specific `auth` schema.
-- 2. The `user_profiles` table no longer has a foreign key to `auth.users`. The `id` is now a primary key that your auth provider will supply.
-- 3. RLS policies now use `current_setting('app.current_user_id', true)` instead of `auth.uid()`.
--    Your API backend is responsible for setting this session variable for each request.
-- 4. Removed the `handle_new_user` trigger. Your API is now responsible for creating a user profile on signup.

-- IMPORTANT: Before running queries, your API must execute:
-- SET app.current_user_id = 'the-logged-in-user-uuid';

-- 1. Create user_profiles table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY, -- This ID will come from your external authentication provider
  external_id TEXT UNIQUE;
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  provider TEXT,
  username TEXT UNIQUE,
  display_name TEXT,
  public_key TEXT,
  discoverable BOOLEAN DEFAULT true,
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Create tags table
CREATE TABLE tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT,
  author_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(author_id, slug)
);

-- 3. Create entries table
CREATE TABLE entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  encrypted_title TEXT NOT NULL,
  encrypted_content TEXT NOT NULL,
  encrypted_frontmatter TEXT,
  encryption_metadata JSONB NOT NULL,
  title_hash TEXT NOT NULL,
  content_preview_hash TEXT,
  is_published BOOLEAN DEFAULT false,
  file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Create entry_tags junction table
CREATE TABLE entry_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID REFERENCES entries(id) ON DELETE CASCADE NOT NULL,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(entry_id, tag_id)
);

-- 5. Create user_tags junction table
CREATE TABLE user_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tagger_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  target_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(tagger_id, target_id, tag_id),
  CHECK (tagger_id != target_id)
);

-- 6. Create entry_access_keys table
CREATE TABLE entry_access_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID REFERENCES entries(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  encrypted_entry_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  key_nonce TEXT NOT NULL,

  UNIQUE(entry_id, user_id)
);

-- 7. Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_access_keys ENABLE ROW LEVEL SECURITY;

-- Helper function to get the current user's ID from the session variable
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN current_setting('app.current_user_id', true)::UUID;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. RLS Policies for user_profiles
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (id = get_current_user_id());
CREATE POLICY "Users can view discoverable profiles" ON user_profiles FOR SELECT USING (discoverable = true);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (id = get_current_user_id());
-- Note: INSERT policy is not strictly needed if the API handles it with elevated privileges.
-- For safety, we can add one that checks the ID against the session variable.
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (id = get_current_user_id());


-- 9. RLS Policies for tags
CREATE POLICY "Users can view own tags" ON tags FOR SELECT USING (author_id = get_current_user_id());
CREATE POLICY "Users can view tags they're tagged with" ON tags FOR SELECT USING (id IN (SELECT tag_id FROM user_tags WHERE target_id = get_current_user_id()));
CREATE POLICY "Users can manage own tags" ON tags FOR ALL USING (author_id = get_current_user_id());

-- 10. RLS Policies for entries
CREATE OR REPLACE FUNCTION can_view_entry(entry_id_to_check UUID, user_id_to_check UUID)
RETURNS BOOLEAN AS $$
DECLARE
  entry_author_id UUID;
  entry_is_published BOOLEAN;
BEGIN
  SELECT author_id, is_published INTO entry_author_id, entry_is_published FROM entries WHERE id = entry_id_to_check;
  IF entry_author_id = user_id_to_check THEN RETURN TRUE; END IF;
  IF entry_is_published = false THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM entry_tags et
    JOIN user_tags ut ON et.tag_id = ut.tag_id
    WHERE et.entry_id = entry_id_to_check AND ut.target_id = user_id_to_check AND ut.tagger_id = entry_author_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Users can view entries they have access to" ON entries FOR SELECT USING (can_view_entry(id, get_current_user_id()));
CREATE POLICY "Authors can manage own entries" ON entries FOR ALL USING (author_id = get_current_user_id());

-- 11. RLS Policies for entry_tags
CREATE POLICY "Users can view entry tags for accessible entries" ON entry_tags FOR SELECT USING (entry_id IN (SELECT id FROM entries));
CREATE POLICY "Authors can manage their entry tags" ON entry_tags FOR ALL USING (entry_id IN (SELECT id FROM entries WHERE author_id = get_current_user_id()));

-- 12. RLS Policies for user_tags
CREATE POLICY "Taggers can view their granted permissions" ON user_tags FOR SELECT USING (tagger_id = get_current_user_id());
CREATE POLICY "Tagged users can view their received permissions" ON user_tags FOR SELECT USING (target_id = get_current_user_id());
CREATE POLICY "Users can manage permissions they grant" ON user_tags FOR ALL USING (tagger_id = get_current_user_id());

-- 13. RLS Policies for entry_access_keys
CREATE POLICY "Users can view their own entry access keys" ON entry_access_keys FOR SELECT USING (user_id = get_current_user_id());
CREATE POLICY "Authors can grant key access" ON entry_access_keys FOR INSERT WITH CHECK ( (SELECT author_id FROM entries WHERE id = entry_id) = get_current_user_id() );
CREATE POLICY "Users can manage key access" ON entry_access_keys FOR DELETE USING ( (user_id = get_current_user_id()) OR ((SELECT author_id FROM entries WHERE id = entry_id) = get_current_user_id()) );

-- 14. Create indexes
CREATE INDEX idx_entries_author_id ON entries(author_id);
CREATE INDEX idx_entries_published ON entries(is_published) WHERE is_published = true;
CREATE INDEX idx_tags_author_id ON tags(author_id);
CREATE INDEX idx_entry_tags_entry_id ON entry_tags(entry_id);
CREATE INDEX idx_entry_tags_tag_id ON entry_tags(tag_id);
CREATE INDEX idx_user_tags_tagger_target ON user_tags(tagger_id, target_id);
CREATE INDEX idx_user_tags_target_tag ON user_tags(target_id, tag_id);
CREATE INDEX idx_entry_access_keys_entry_id ON entry_access_keys(entry_id);
CREATE INDEX idx_entry_access_keys_user_id ON entry_access_keys(user_id);

-- 15. Create function to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all relevant tables
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_entries_updated_at BEFORE UPDATE ON entries FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 16. Grant permissions
-- These permissions are for a generic 'authenticated_user' role that your API will use.
-- You must create this role and grant it to your database user.
-- Example: CREATE ROLE authenticated_user; GRANT authenticated_user TO my_api_user;
GRANT USAGE ON SCHEMA public TO authenticated_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated_user;
