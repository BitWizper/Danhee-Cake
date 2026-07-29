/**
 * init-chroma.js — Script para inicializar ChromaDB con datos de Danhee Cake
 */

const { ChromaClient } = require('chromadb');
const fs = require('fs');
const path = require('path');

async function initializeChroma() {
    const chromaHost = process.env.CHROMA_HOST || 'http://localhost:8000';
    console.log(`Conectando a ChromaDB en ${chromaHost}...`);
    
    const client = new ChromaClient({ path: chromaHost });
    
    try {
        // Crear colección
        const collection = await client.getOrCreateCollection({
            name: 'danhee_knowledge',
            metadata: { description: 'Base de conocimiento de Danhee Cake' }
        });
        console.log('✅ Colección danhee_knowledge creada/encontrada');
        
        // Datos de ejemplo para inicializar
        const sampleDocuments = [
            {
                text: 'Danhee Cake es una plataforma de repostería personalizada que conecta clientes con reposteros talentosos. Los clientes pueden explorar catálogos, agendar citas de degustación y hacer pedidos personalizados.',
                metadata: { category: 'general', type: 'about' }
            },
            {
                text: 'Las categorías de pasteles disponibles incluyen: Cumpleaños, Bodas, XV Años, Baby Shower, Aniversarios, Graduaciones, Eventos Corporativos y Diseños Personalizados.',
                metadata: { category: 'catalog', type: 'categories' }
            },
            {
                text: 'Para agendar una cita de degustación, los clientes pueden navegar por el catálogo de reposteros, seleccionar uno que les interese y usar el chatbot para solicitar una cita en fecha y hora específicas.',
                metadata: { category: 'appointments', type: 'booking' }
            },
            {
                text: 'Los reposteros pueden gestionar su catálogo de pasteles, actualizar precios, agregar nuevos diseños, eliminar pasteles y consultar sus citas de degustación a través del chatbot especializado.',
                metadata: { category: 'bakers', type: 'management' }
            },
            {
                text: 'Los precios de los pasteles varían según el tamaño, diseño, ingredientes y complejidad. Los reposteros establecen sus propios precios y los clientes pueden consultarlos directamente con cada repostero.',
                metadata: { category: 'pricing', type: 'general' }
            },
            {
                text: 'El chatbot de Danhee Cake usa inteligencia artificial para ayudar a clientes y reposteros. Puede responder preguntas sobre el catálogo, agendar citas, proporcionar información de contacto y asistir en la gestión de pedidos.',
                metadata: { category: 'chatbot', type: 'features' }
            },
            {
                text: 'Los clientes pueden filtrar pasteles por categoría, precio y características especiales. También pueden ver fotos de los diseños y leer descripciones detalladas antes de contactar al repostero.',
                metadata: { category: 'catalog', type: 'search' }
            },
            {
                text: 'Las citas de degustación son reuniones presenciales donde el cliente puede probar los pasteles del repostero antes de hacer un pedido definitivo. Se recomienda agendar con anticipación.',
                metadata: { category: 'appointments', type: 'tastings' }
            }
        ];
        
        // Verificar si la colección ya tiene documentos
        const existingCount = await collection.count();
        console.log(`Documentos existentes en la colección: ${existingCount}`);
        
        if (existingCount === 0) {
            console.log('Agregando documentos de ejemplo...');
            
            // Agregar documentos (sin embeddings por ahora, ChromaDB los generará automáticamente)
            for (const doc of sampleDocuments) {
                await collection.add({
                    ids: [Date.now().toString() + Math.random().toString(36).substring(7)],
                    documents: [doc.text],
                    metadatas: [doc.metadata]
                });
            }
            
            console.log(`✅ ${sampleDocuments.length} documentos agregados`);
        } else {
            console.log('La colección ya contiene documentos, no se agregaron nuevos');
        }
        
        // Verificar conteo final
        const finalCount = await collection.count();
        console.log(`Total de documentos en la colección: ${finalCount}`);
        
        console.log('\n✅ ChromaDB inicializado correctamente');
        console.log(`📡 ChromaDB corriendo en: ${chromaHost}`);
        console.log(`📚 Colección: danhee_knowledge`);
        
    } catch (error) {
        console.error('❌ Error inicializando ChromaDB:', error.message);
        process.exit(1);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    initializeChroma().catch(error => {
        console.error('Error fatal:', error);
        process.exit(1);
    });
}

module.exports = { initializeChroma };
