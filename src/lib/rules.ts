export const TEAMS = [
  { id: 'tiburones', name: 'Tiburones', color: '#3979ca', mark: 'TI' },
  { id: 'leones', name: 'Leones', color: '#df9b28', mark: 'LE' },
  { id: 'osos', name: 'Osos', color: '#956640', mark: 'OS' },
  { id: 'lobos', name: 'Lobos', color: '#727d96', mark: 'LO' },
  { id: 'cobras', name: 'Cobras', color: '#42957b', mark: 'CO' },
  { id: 'halcon', name: 'Halcón', color: '#9967bd', mark: 'HA' },
] as const
export const PLACES = [600,450,350,300,250,100] as const
export { default as DEFAULT_CATEGORIES } from '../config/default-categories.json'
export const teamIds = TEAMS.map(t=>t.id)
export function rank<T extends {total:number;name:string}>(teams:T[]) {
  const sorted=[...teams].sort((a,b)=>b.total-a.total || a.name.localeCompare(b.name,'es'))
  return sorted.map((t,i)=>({...t,position:i>0&&t.total===sorted[i-1].total ? sorted.findIndex(x=>x.total===t.total)+1 : i+1}))
}
