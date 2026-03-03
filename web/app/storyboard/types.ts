export type Style = {
  id: string;
  name: string;
  prompt: string;
  created_at?: string;
};

export type Storyboard = {
  id: string;
  name: string;
  style?: string | null;
  project_key?: string | null;
};

export type Character = {
  id: string;
  storyboard_id: string;
  name: string;
  image?: string | null;
};

export type Location = {
  id: string;
  storyboard_id: string;
  name: string;
  image?: string | null;
};

export type Tile = {
  id: string;
  storyboard_id: string;
  tile_number: number;
  image?: string | null;
  prompt: string;
  location_id?: string | null;
  character_ids?: string[] | null;
};

export type StoryboardDetailResponse = {
  storyboard: Storyboard & {
    created_at?: string;
    updated_at?: string;
  };
  characters: Character[];
  locations: Location[];
  tiles: Tile[];
};

