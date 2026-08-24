#!/usr/bin/env node
// Genera el bcrypt de una contraseña y el UPDATE para dmc.usuario.
//
//   node scripts/hash-password.mjs                       # pide la contraseña sin mostrarla
//   node scripts/hash-password.mjs usuario@grupodmc.cl   # además arma el UPDATE
//
// La contraseña se pide por stdin a propósito: pasarla como argumento la
// dejaría en el historial del shell y en la lista de procesos.

import bcrypt from "bcryptjs";
import { createInterface } from "node:readline";
import { stdin, stdout, argv, exit } from "node:process";

const COSTO = 12;
const email = argv[2] ?? null;

function preguntarOculto(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    let mostrandoPrompt = true;
    // Silencia el eco de lo tecleado: solo se deja pasar el propio prompt.
    rl._writeToOutput = (texto) => {
      if (mostrandoPrompt) {
        stdout.write(texto);
        mostrandoPrompt = false;
      }
    };
    rl.question(prompt, (respuesta) => {
      stdout.write("\n");
      rl.close();
      resolve(respuesta);
    });
  });
}

const password = await preguntarOculto("Contraseña: ");
if (!password) {
  console.error("No se ingresó ninguna contraseña.");
  exit(1);
}
if (password.length < 10) {
  console.error("Usa al menos 10 caracteres.");
  exit(1);
}

const hash = await bcrypt.hash(password, COSTO);

console.log(`\nHash bcrypt (costo ${COSTO}):\n${hash}\n`);

if (email) {
  const seguro = email.replace(/'/g, "''");
  console.log("SQL para aplicarlo:\n");
  console.log(`UPDATE dmc.usuario SET password_hash = N'${hash}' WHERE email = N'${seguro}';`);
  console.log("");
}
