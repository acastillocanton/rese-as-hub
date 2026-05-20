export const MONTHS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export type DemoPerson = {
  id: number;
  name: string;
  role: string;
  branch: string;
  team: string;
  reviews: number;
  sent: number;
  avg: number;
  goal: number;
  delta: string;
  avatar: string;
  status?: "active" | "paused" | "invited";
};

export const TEAM: DemoPerson[] = [
  {
    id: 1,
    name: "Carla Ruiz",
    role: "Senior Sales",
    branch: "Inseryal · Oropesa",
    team: "Norte",
    reviews: 87,
    sent: 102,
    avg: 4.9,
    goal: 90,
    delta: "+12",
    avatar: "#CFCFD4",
  },
  {
    id: 2,
    name: "Mateo Salgado",
    role: "Sales",
    branch: "Inseryal · Peñíscola",
    team: "Norte",
    reviews: 74,
    sent: 96,
    avg: 4.8,
    goal: 80,
    delta: "+9",
    avatar: "#C7C7CC",
  },
  {
    id: 3,
    name: "Lucía Vega",
    role: "Senior Sales",
    branch: "Inseryal · Cullera",
    team: "Levante",
    reviews: 71,
    sent: 88,
    avg: 4.9,
    goal: 80,
    delta: "+7",
    avatar: "#BFBFC4",
  },
  {
    id: 4,
    name: "Tomás Iglesias",
    role: "Sales",
    branch: "Inseryal · Peñíscola",
    team: "Norte",
    reviews: 62,
    sent: 95,
    avg: 4.6,
    goal: 80,
    delta: "+2",
    avatar: "#C7C7CC",
  },
  {
    id: 5,
    name: "Noa Herrero",
    role: "Sales",
    branch: "Inseryal · Oropesa",
    team: "Sur",
    reviews: 58,
    sent: 71,
    avg: 4.8,
    goal: 70,
    delta: "+5",
    avatar: "#CFCFD4",
  },
  {
    id: 6,
    name: "Bruno Castaño",
    role: "Junior Sales",
    branch: "Inseryal · Cullera",
    team: "Levante",
    reviews: 41,
    sent: 64,
    avg: 4.5,
    goal: 60,
    delta: "-3",
    avatar: "#BFBFC4",
  },
  {
    id: 7,
    name: "Inés Olivares",
    role: "Sales",
    branch: "Inseryal · Oropesa",
    team: "Sur",
    reviews: 39,
    sent: 58,
    avg: 4.7,
    goal: 60,
    delta: "+1",
    avatar: "#C7C7CC",
  },
  {
    id: 8,
    name: "Pablo Domínguez",
    role: "Junior Sales",
    branch: "Inseryal · Oropesa",
    team: "Sur",
    reviews: 27,
    sent: 49,
    avg: 4.4,
    goal: 50,
    delta: "-6",
    avatar: "#CFCFD4",
  },
];

export type DemoRecent = {
  id: string;
  name: string;
  time: string;
  stars: number;
  sales: string;
  text: string;
  verified: boolean;
  pending?: boolean;
};

export const RECENT: DemoRecent[] = [
  {
    id: "r1",
    name: "Andrea Pinto",
    time: "hace 12 min",
    stars: 5,
    sales: "Carla Ruiz",
    text: "Visita a Inseryal Oropesa impecable. Carla nos explicó cada detalle del plano y los acabados.",
    verified: true,
  },
  {
    id: "r2",
    name: "Familia Soriano",
    time: "hace 38 min",
    stars: 5,
    sales: "Mateo Salgado",
    text: "Atención de diez. Nos enseñó tres tipologías diferentes sin prisa y resolvió cada duda.",
    verified: true,
  },
  {
    id: "r3",
    name: "Jorge Mas",
    time: "hace 1 h",
    stars: 4,
    sales: "Tomás Iglesias",
    text: "Muy correcto. Hubiéramos preferido más información de financiación, pero todo cumplido.",
    verified: true,
  },
  {
    id: "r4",
    name: "Marta Llamas",
    time: "hace 2 h",
    stars: 5,
    sales: "Lucía Vega",
    text: "Lucía es un encanto. Visitamos el apartamento piloto de Cullera y nos lo pintó tal cual lo imaginábamos.",
    verified: true,
  },
  {
    id: "r5",
    name: "Diego Carranza",
    time: "hace 3 h",
    stars: 5,
    sales: "Noa Herrero",
    text: "Oropesa. Salimos con la maqueta clara y un dossier muy completo.",
    verified: false,
    pending: true,
  },
];

export const SERIES_SENT = [128, 142, 151, 160, 178, 196, 208, 192, 215, 234, 251, 268];
export const SERIES_VERIFIED = [86, 97, 106, 115, 132, 148, 162, 151, 174, 191, 208, 227];

export const BRANCHES = [
  { name: "Inseryal · Oropesa", reviews: 142, conv: "82%", stars: "4,9", dev: "+14%" },
  { name: "Inseryal · Peñíscola", reviews: 128, conv: "76%", stars: "4,7", dev: "+9%" },
  { name: "Inseryal · Cullera", reviews: 112, conv: "81%", stars: "4,8", dev: "+11%" },
  { name: "Inseryal · Marina d'Or", reviews: 77, conv: "70%", stars: "4,6", dev: "+3%" },
];
