import {randomBytes,scryptSync} from 'node:crypto'
import readline from 'node:readline/promises'
import {stdin,stdout} from 'node:process'
const rl=readline.createInterface({input:stdin,output:stdout})
const email=(await rl.question('Correo del administrador: ')).trim().toLowerCase()
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Correo inválido')
// Read the password without echoing it when running in a terminal.
rl.close()
async function hidden(prompt){stdout.write(prompt);if(!stdin.isTTY)throw new Error('Ejecuta este asistente en una terminal interactiva.');stdin.setRawMode(true);stdin.resume();return new Promise((resolve,reject)=>{let value='';const onData=buf=>{for(const ch of buf.toString()){if(ch==='\u0003'){cleanup();reject(new Error('Cancelado'));return}if(ch==='\r'||ch==='\n'){cleanup();stdout.write('\n');resolve(value);return}if(ch==='\u007f'||ch==='\b')value=value.slice(0,-1);else if(ch>=' ')value+=ch;}};function cleanup(){stdin.off('data',onData);stdin.setRawMode(false);stdin.pause()}stdin.on('data',onData)})}
const password=await hidden('Contraseña inicial (no se muestra): ')
if(password.length<12||password.length>128)throw new Error('Usa de 12 a 128 caracteres.')
const secret=()=>randomBytes(32).toString('hex')
const apiSecret=secret(),session=secret(),pepper=secret(),hash=scryptSync(password,email+':'+pepper,64).toString('hex')
console.log('\nGuarda estos valores en privado. No se escribirá tu contraseña.\n')
console.log('Propiedades del proyecto de Apps Script:')
console.log('API_SECRET='+apiSecret+'\nADMIN_EMAIL='+email+'\nADMIN_HASH='+hash+'\nADMIN_NAME=Administrador')
console.log('\nVariables del servidor Next.js (.env.local o panel del hosting):')
console.log('APP_URL=http://localhost:3000\nGOOGLE_SCRIPT_URL=PEGA_AQUI_LA_URL_QUE_TERMINA_EN_EXEC\nGOOGLE_API_SECRET='+apiSecret+'\nSESSION_SECRET='+session+'\nAUTH_PEPPER='+pepper)
console.log('\nNo vuelvas a ejecutar este asistente para actualizar un despliegue existente: cambiar AUTH_PEPPER invalida todas las contraseñas.')
