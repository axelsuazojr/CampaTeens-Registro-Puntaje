import {test} from 'node:test'
import assert from 'node:assert/strict'
import {sessionToken,verifySession,passwordProof} from '../src/lib/auth'
process.env.SESSION_SECRET='s'.repeat(64);process.env.AUTH_PEPPER='p'.repeat(64)
test('Sesión firmada: acepta referencia legítima y rechaza cambios y vencimiento',()=>{const token=sessionToken({id:2,version:3},1000);assert.deepEqual(verifySession(token,2000),{id:2,version:3});assert.throws(()=>verifySession(token+'x',2000),/sesión/);assert.throws(()=>verifySession(token,1000+8*3600*1000),/sesión/)})
test('La credencial deriva con scrypt, no guarda la contraseña y depende del correo',async()=>{const a=await passwordProof('password-de-prueba','ana@example.com');assert.equal(a.length,128);assert.equal(a,await passwordProof('password-de-prueba','ANA@example.com'));assert.notEqual(a,await passwordProof('password-de-prueba','luis@example.com'));assert.notEqual(a,await passwordProof('otra-password','ana@example.com'))})
