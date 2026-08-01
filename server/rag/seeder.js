/**
 * seeder.js — Script de sembrado de datos para pruebas de estrés
 * Genera 10,000+ registros realistas para evaluar rendimiento
 * Uso: node server/rag/seeder.js
 */

const db = require('./db-config');

// Datos de ejemplo para generación
const NOMBRES = ['María', 'José', 'Carlos', 'Ana', 'Luis', 'Carmen', 'Miguel', 'Laura', 'Pedro', 'Sofía', 'Alejandro', 'Valentina', 'Diego', 'Camila', 'Fernando', 'Isabella', 'Ricardo', 'Natalia', 'Javier', 'Daniela'];
const APELLIDOS = ['García', 'Martínez', 'López', 'Rodríguez', 'González', 'Pérez', 'Sánchez', 'Romero', 'Torres', 'Ruiz', 'Vargas', 'Castro', 'Mendoza', 'Álvarez', 'Flores', 'Morales', 'Hernández', 'Jiménez', 'Reyes', 'Cruz'];
const CATEGORIAS = ['Cumpleaños', 'Bodas', 'XV Años', 'Baby Shower', 'Aniversarios', 'Graduaciones', 'Eventos Corporativos', 'Diseños Personalizados'];
const SABORES = ['Chocolate', 'Vainilla', 'Red Velvet', 'Cheesecake', 'Tres Leches', 'Limon', 'Fresa', 'Mango', 'Café', 'Carrot', 'Oreo', 'Nutella'];
const RELLENOS = ['Crema de chocolate', 'Crema de vainilla', 'Ganache', 'Dulce de leche', 'Mermelada de fresa', 'Nutella', 'Cajeta', 'Crema de limón'];
const ESTADOS_CITA = ['pendiente', 'confirmada', 'completada', 'cancelada'];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateEmail(nombre, apellido) {
    const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
    return `${nombre.toLowerCase()}.${apellido.toLowerCase()}${randomInt(1, 999)}@${randomElement(domains)}`;
}

function generatePhone() {
    return `+52${randomInt(1000000000, 9999999999)}`;
}

function generatePrice() {
    return randomInt(500, 5000);
}

async function seedUsers(count) {
    console.log(`📝 Sembrando ${count} usuarios...`);
    
    const conn = await db.getConnection();
    if (!conn) return 0;
    
    let seeded = 0;
    
    try {
        for (let i = 0; i < count; i++) {
            const nombre = randomElement(NOMBRES);
            const apellido = randomElement(APELLIDOS);
            const email = generateEmail(nombre, apellido);
            
            await conn.execute(
                `INSERT INTO users (name, email, password, role, created_at) 
                 VALUES (?, ?, ?, ?, NOW())`,
                [nombre, apellido, email, 'hashed_password', randomInt(0, 1) === 0 ? 'cliente' : 'repostero']
            );
            
            seeded++;
            if (seeded % 100 === 0) {
                console.log(`   Progreso: ${seeded}/${count}`);
            }
        }
        
        console.log(`✅ Usuarios sembrados: ${seeded}`);
        return seeded;
    } catch (e) {
        console.error(`❌ Error sembrando usuarios: ${e.message}`);
        return seeded;
    } finally {
        conn.release();
    }
}

async function seedCakes(count) {
    console.log(`🎂 Sembrando ${count} pasteles...`);
    
    const conn = await db.getConnection();
    if (!conn) return 0;
    
    let seeded = 0;
    
    try {
        // Obtener IDs de categorías y reposteros
        const [categories] = await conn.execute('SELECT id FROM categories LIMIT 10');
        const [bakers] = await conn.execute('SELECT id FROM baker_profiles LIMIT 10');
        
        if (categories.length === 0 || bakers.length === 0) {
            console.log('⚠️ No hay categorías o reposteros suficientes, saltando pasteles');
            return 0;
        }
        
        for (let i = 0; i < count; i++) {
            const category = randomElement(categories);
            const baker = randomElement(bakers);
            
            await conn.execute(
                `INSERT INTO cakes (baker_id, category_id, name, description, price, image_url, is_featured, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    baker.id,
                    category.id,
                    `Pastel ${randomElement(SABORES)} ${randomElement(CATEGORIAS)}`,
                    `Delicioso pastel de ${randomElement(SABORES)} con relleno de ${randomElement(RELLENOS)}. Perfecto para ${randomElement(CATEGORIAS)}.`,
                    generatePrice(),
                    `https://example.com/cake_${i}.jpg`,
                    randomInt(0, 1)
                ]
            );
            
            seeded++;
            if (seeded % 100 === 0) {
                console.log(`   Progreso: ${seeded}/${count}`);
            }
        }
        
        console.log(`✅ Pasteles sembrados: ${seeded}`);
        return seeded;
    } catch (e) {
        console.error(`❌ Error sembrando pasteles: ${e.message}`);
        return seeded;
    } finally {
        conn.release();
    }
}

async function seedAppointments(count) {
    console.log(`📅 Sembrando ${count} citas...`);
    
    const conn = await db.getConnection();
    if (!conn) return 0;
    
    let seeded = 0;
    
    try {
        // Obtener IDs de usuarios
        const [users] = await conn.execute('SELECT id FROM users LIMIT 100');
        
        if (users.length === 0) {
            console.log('⚠️ No hay usuarios suficientes, saltando citas');
            return 0;
        }
        
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 6);
        
        for (let i = 0; i < count; i++) {
            const user = randomElement(users);
            const appointmentDate = randomDate(startDate, endDate);
            
            await conn.execute(
                `INSERT INTO appointments (client_id, appointment_date, status, notes, created_at) 
                 VALUES (?, ?, ?, ?, NOW())`,
                [
                    user.id,
                    appointmentDate,
                    randomElement(ESTADOS_CITA),
                    `Cita para consulta de ${randomElement(CATEGORIAS)}. Cliente interesado en pastel de ${randomElement(SABORES)}.`
                ]
            );
            
            seeded++;
            if (seeded % 100 === 0) {
                console.log(`   Progreso: ${seeded}/${count}`);
            }
        }
        
        console.log(`✅ Citas sembradas: ${seeded}`);
        return seeded;
    } catch (e) {
        console.error(`❌ Error sembrando citas: ${e.message}`);
        return seeded;
    } finally {
        conn.release();
    }
}

async function seedChatMessages(count) {
    console.log(`💬 Sembrando ${count} mensajes de chat...`);
    
    const conn = await db.getConnection();
    if (!conn) return 0;
    
    let seeded = 0;
    
    try {
        // Obtener IDs de sesiones
        const [sessions] = await conn.execute('SELECT conversation_id FROM chat_sessions LIMIT 100');
        
        if (sessions.length === 0) {
            console.log('⚠️ No hay sesiones de chat suficientes, saltando mensajes');
            return 0;
        }
        
        const userMessages = [
            '¿Qué tipos de pasteles tienen?',
            '¿Cuánto cuesta un pastel de cumpleaños?',
            '¿Puedo agendar una cita para ver catálogo?',
            '¿Tienen pasteles para bodas?',
            '¿Qué sabores de relleno ofrecen?',
            '¿Cuál es el precio de un pastel para 20 personas?',
            '¿Hacen pasteles personalizados?',
            '¿Tienen pasteles sin gluten?',
            '¿Cuánto tiempo tardan en entregar?',
            '¿Aceptan pagos con tarjeta?'
        ];
        
        const assistantMessages = [
            'Tenemos una gran variedad de pasteles para diferentes ocasiones.',
            'Nuestros pasteles de cumpleaños cuestan entre $500 y $3000 dependiendo del tamaño.',
            'Claro, puedes agendar una cita visitando nuestra sección de citas.',
            'Sí, ofrecemos pasteles de bodas con diseños personalizados.',
            'Ofrecemos rellenos de chocolate, vainilla, ganache, dulce de leche y más.',
            'Para 20 personas, el precio aproximado es de $1500.',
            'Sí, hacemos pasteles personalizados según tus necesidades.',
            'Tenemos opciones sin gluten, por favor contáctanos para más detalles.',
            'El tiempo de entrega varía entre 3-7 días dependiendo del pedido.',
            'Sí, aceptamos pagos con tarjeta y efectivo.'
        ];
        
        for (let i = 0; i < count; i++) {
            const session = randomElement(sessions);
            const isUser = Math.random() > 0.5;
            
            await conn.execute(
                `INSERT INTO chat_messages (conversation_id, role, content, created_at) 
                 VALUES (?, ?, ?, NOW())`,
                [
                    session.conversation_id,
                    isUser ? 'user' : 'assistant',
                    isUser ? randomElement(userMessages) : randomElement(assistantMessages)
                ]
            );
            
            seeded++;
            if (seeded % 100 === 0) {
                console.log(`   Progreso: ${seeded}/${count}`);
            }
        }
        
        console.log(`✅ Mensajes de chat sembrados: ${seeded}`);
        return seeded;
    } catch (e) {
        console.error(`❌ Error sembrando mensajes de chat: ${e.message}`);
        return seeded;
    } finally {
        conn.release();
    }
}

async function main() {
    console.log('🚀 Iniciando sembrado de datos para pruebas de estrés...\n');
    
    const totalRecords = 10000;
    
    try {
        // Distribución de registros
        const usersCount = Math.floor(totalRecords * 0.2); // 2000 usuarios
        const cakesCount = Math.floor(totalRecords * 0.3); // 3000 pasteles
        const appointmentsCount = Math.floor(totalRecords * 0.3); // 3000 citas
        const chatMessagesCount = Math.floor(totalRecords * 0.2); // 2000 mensajes
        
        const users = await seedUsers(usersCount);
        const cakes = await seedCakes(cakesCount);
        const appointments = await seedAppointments(appointmentsCount);
        const chatMessages = await seedChatMessages(chatMessagesCount);
        
        const totalSeeded = users + cakes + appointments + chatMessages;
        
        console.log('\n📊 Resumen del sembrado:');
        console.log(`   Usuarios: ${users}`);
        console.log(`   Pasteles: ${cakes}`);
        console.log(`   Citas: ${appointments}`);
        console.log(`   Mensajes de chat: ${chatMessages}`);
        console.log(`   Total: ${totalSeeded} registros`);
        
        if (totalSeeded >= totalRecords) {
            console.log('\n✅ Sembrado completado exitosamente');
        } else {
            console.log('\n⚠️ Sembrado parcialmente completado');
        }
        
    } catch (e) {
        console.error(`\n❌ Error fatal en sembrado: ${e.message}`);
        process.exit(1);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    main().catch(error => {
        console.error('Error fatal:', error);
        process.exit(1);
    });
}

module.exports = { seedUsers, seedCakes, seedAppointments, seedChatMessages };
