import type { Cliente, Sucursal, Tecnico, Usuario } from "@/lib/types";

// Datos de ejemplo — copiados 1:1 de la sección 12 de sql/dmc_contingencia_sqlserver.sql
// para que la UI y el futuro backend real describan exactamente los mismos registros.

export const clientes: Cliente[] = [
  { id: 1, rut: "96.812.330-7", razonSocial: "Comercial Maui and Sons SpA", nombreFantasia: "Maui and Sons", activo: true },
  { id: 2, rut: "77.401.220-4", razonSocial: "Adidas Chile Ltda.", nombreFantasia: "Adidas Chile", activo: true },
  { id: 3, rut: "81.239.055-2", razonSocial: "Comercializadora Tricot S.A.", nombreFantasia: "Tricot", activo: true },
  { id: 4, rut: "79.550.114-9", razonSocial: "Preunic S.A.", nombreFantasia: "Preunic", activo: true },
  { id: 5, rut: "76.998.043-1", razonSocial: "Deportes Sparta SpA", nombreFantasia: "Sparta", activo: false },
];

export const sucursales: Sucursal[] = [
  { id: 1, clienteId: 5, nombre: "Parque Arauco", codigo: "SP-241", direccion: "Av. Kennedy 5413", comuna: "Las Condes", region: "Metropolitana", telefono: "+56 2 2299 4100", activo: true },
  { id: 2, clienteId: 1, nombre: "Mall Plaza Tobalaba", codigo: "MS-118", direccion: "Av. Camilo Henríquez 3296", comuna: "Puente Alto", region: "Metropolitana", telefono: "+56 2 2871 5522", activo: true },
  { id: 3, clienteId: 2, nombre: "Costanera Center", codigo: "AD-002", direccion: "Andrés Bello 2425", comuna: "Providencia", region: "Metropolitana", telefono: "+56 2 2618 9040", activo: true },
  { id: 4, clienteId: 3, nombre: "Paseo Ahumada", codigo: "TR-055", direccion: "Ahumada 131", comuna: "Santiago", region: "Metropolitana", telefono: "+56 2 2632 7788", activo: true },
  { id: 5, clienteId: 1, nombre: "Mall Marina Arauco", codigo: "MS-330", direccion: "14 Norte 961", comuna: "Viña del Mar", region: "Valparaíso", telefono: "+56 32 268 4410", activo: true },
  { id: 6, clienteId: 4, nombre: "Mall Plaza Oeste", codigo: "PR-076", direccion: "Av. Américo Vespucio 1501", comuna: "Cerrillos", region: "Metropolitana", telefono: "+56 2 2544 9021", activo: false },
  { id: 7, clienteId: 4, nombre: "Mall Plaza Norte", codigo: "PR-031", direccion: "Av. Américo Vespucio 1737", comuna: "Huechuraba", region: "Metropolitana", telefono: "+56 2 2733 1180", activo: true },
  { id: 8, clienteId: 2, nombre: "Mall Plaza Vespucio", codigo: "AD-014", direccion: "Froilán Roa 7205", comuna: "La Florida", region: "Metropolitana", telefono: "+56 2 2510 4420", activo: true },
  { id: 9, clienteId: 3, nombre: "Portal Ñuñoa", codigo: "TR-090", direccion: "Irarrázaval 2698", comuna: "Ñuñoa", region: "Metropolitana", telefono: "+56 2 2277 6611", activo: true },
  { id: 10, clienteId: 4, nombre: "Mall Arauco Maipú", codigo: "PR-112", direccion: "Av. Américo Vespucio 399", comuna: "Maipú", region: "Metropolitana", telefono: "+56 2 2531 7745", activo: true },
  { id: 11, clienteId: 1, nombre: "Mall Plaza Trébol", codigo: "MS-402", direccion: "Av. Jorge Alessandri 3177", comuna: "Talcahuano", region: "Biobío", telefono: "+56 41 248 9930", activo: true },
  { id: 12, clienteId: 2, nombre: "Mall Alto Las Condes", codigo: "AD-021", direccion: "Av. Kennedy 9001", comuna: "Las Condes", region: "Metropolitana", telefono: "+56 2 2213 5560", activo: true },
  { id: 13, clienteId: 5, nombre: "Mall Plaza Egaña", codigo: "SP-160", direccion: "Av. Larraín 5862", comuna: "La Reina", region: "Metropolitana", telefono: "+56 2 2277 9021", activo: true },
  { id: 14, clienteId: 4, nombre: "Mall Arauco Estación", codigo: "PR-140", direccion: "Av. Libertador Bernardo O'Higgins 3470", comuna: "Estación Central", region: "Metropolitana", telefono: "+56 2 2681 4410", activo: true },
];

export const tecnicos: Tecnico[] = [
  { id: 1, rut: "16.402.771-8", nombres: "Harold", apellidoPaterno: "Peralta", apellidoMaterno: null, nombreCompleto: "Harold Peralta", email: "hperalta@grupodmc.cl", telefono: "+56 9 7712 4408", activo: true },
  { id: 2, rut: "17.884.102-3", nombres: "Daniela", apellidoPaterno: "Fuentes", apellidoMaterno: "Rojas", nombreCompleto: "Daniela Fuentes", email: "daniela.fuentes@grupodmc.cl", telefono: "+56 9 6640 1122", activo: true },
  { id: 3, rut: "15.221.907-K", nombres: "Rodrigo", apellidoPaterno: "Pinto", apellidoMaterno: "Cádiz", nombreCompleto: "Rodrigo Pinto", email: "rodrigo.pinto@grupodmc.cl", telefono: "+56 9 9004 3312", activo: true },
  { id: 4, rut: "18.330.554-1", nombres: "Camila", apellidoPaterno: "Torres", apellidoMaterno: "Vera", nombreCompleto: "Camila Torres", email: "camila.torres@grupodmc.cl", telefono: "+56 9 5512 8890", activo: true },
  { id: 5, rut: "14.007.663-5", nombres: "Ignacio", apellidoPaterno: "Salas", apellidoMaterno: "Muñoz", nombreCompleto: "Ignacio Salas", email: "ignacio.salas@grupodmc.cl", telefono: "+56 9 3391 5540", activo: false },
];

export const usuarios: Usuario[] = [
  { id: 1, email: "camila.vergara@grupodmc.cl", rol: "COORDINADOR", tecnicoId: null, activo: true, ultimoAccesoEn: null },
  { id: 2, email: "admin@grupodmc.cl", rol: "ADMIN", tecnicoId: null, activo: true, ultimoAccesoEn: null },
  { id: 3, email: "hperalta@grupodmc.cl", rol: "TECNICO", tecnicoId: 1, activo: true, ultimoAccesoEn: null },
  { id: 4, email: "daniela.fuentes@grupodmc.cl", rol: "TECNICO", tecnicoId: 2, activo: true, ultimoAccesoEn: null },
  { id: 5, email: "ignacio.salas@grupodmc.cl", rol: "TECNICO", tecnicoId: 5, activo: false, ultimoAccesoEn: null },
];

// Credenciales de demo (equivalentes a los HASHBYTES del DDL, en texto plano solo
// para el login mock — la app real jamás debe guardar contraseñas así).
export const credencialesDemo: Record<string, string> = {
  "camila.vergara@grupodmc.cl": "Dmc.Coord2026",
  "admin@grupodmc.cl": "Dmc.Admin2026",
  "hperalta@grupodmc.cl": "contingencia",
  "daniela.fuentes@grupodmc.cl": "Terreno.2026",
  "ignacio.salas@grupodmc.cl": "Terreno.2026",
};

export function getClienteById(id: number): Cliente | undefined {
  return clientes.find((c) => c.id === id);
}
export function getSucursalById(id: number): Sucursal | undefined {
  return sucursales.find((s) => s.id === id);
}
export function getTecnicoById(id: number): Tecnico | undefined {
  return tecnicos.find((t) => t.id === id);
}
export function getUsuarioByEmail(email: string): Usuario | undefined {
  return usuarios.find((u) => u.email.toLowerCase() === email.toLowerCase());
}
