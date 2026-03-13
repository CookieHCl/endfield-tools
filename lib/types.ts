export type WeaponOption = {
  basic: string;
  additional: string;
  skill: string;
};

export type Weapon = {
  name: string;
  image_name: string;
  signature_weapon?: string;
  options: WeaponOption[];
  star: number;
};

