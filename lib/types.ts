export type WeaponOption = {
  basic: string;
  additional: string;
  skill: string;
};

export type Weapon = {
  name: string;
  image_name: string;
  signature_weapon?: string;
  options: WeaponOption;
  star: number;
};

export type DungeonBase = {
  id: number;
};

export type Dungeon = DungeonBase & {
  name: string;
  region: string;
  image_name: string;
  additional_attributes: string[];
  skill_attributes: string[];
};


