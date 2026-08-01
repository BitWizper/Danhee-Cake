/**
 * verify-chroma.js - Script para verificar el estado de ChromaDB y la ingestión de documentos
 */

const { ChromaClient } = require('chromadb');
const fs = require('fs');
const path = require('path');

const CHROMA_HOST = process.env.CHROMA_HOST || 'http://localhost:8000';
const COLLECTION_NAME = 'danhee_knowledge';
const DATA_DIR = path.join(__dirname, 'data');

async function verifyChromaDB() {
    console.log('🔍 Verificando estado de ChromaDB...\n');
    
    try {
        // Conectar a ChromaDB
        const client = new ChromaClient({ path: CHROMA_HOST });
        console.log(`📡 Conectando a ChromaDB en: ${CHROMA_HOST}`);
        
        // Listar colecciones
        const collections = await client.listCollections();
        console.log(`📚 Colecciones encontradas: ${collections.length}`);
        
        if (collections.length === 0) {
            console.log('⚠️  No hay colecciones en ChromaDB');
            console.log('💡 Ejecuta: node ingest-documents.js para crear la base de conocimiento');
            return;
        }
        
        // Buscar nuestra colección
        const ourCollection = collections.find(c => c.name === COLLECTION_NAME);
        
        if (!ourCollection) {
            console.log(`⚠️  La colección '${COLLECTION_NAME}' no existe`);
            console.log('💡 Ejecuta: node ingest-documents.js para crear la base de conocimiento');
            return;
        }
        
        console.log(`✅ Colección '${COLLECTION_NAME}' encontrada`);
        
        // Obtener conteo de documentos
        const collection = await client.getCollection({ name: COLLECTION_NAME });
        const count = await collection.count();
        console.log(`📊 Documentos indexados: ${count}`);
        
        if (count === 0) {
            console.log('⚠️  La colección está vacía');
            console.log('💡 Ejecuta: node ingest-documents.js para indexar los documentos');
            return;
        }
        
        // Obtener algunos documentos de muestra
        const sample = await collection.get({
            limit: 2,
            include: ['documents', 'metadatas']
        });
        
        console.log('\n📄 Muestra de documentos indexados:');
        sample.documents.forEach((doc, i) => {
            console.log(`\n  Documento ${i + 1}:`);
            console.log(`    Texto: ${doc.substring(0, 100)}...`);
            console.log(`    Metadata:`, sample.metadatas[i]);
        });
        
        // Verificar archivos PDF disponibles
        console.log('\n📁 Archivos PDF disponibles para ingestión:');
        const pdfFiles = fs.readdirSync(DATA_DIR).filter(file => file.endsWith('.pdf'));
        
        if (pdfFiles.length === 0) {
            console.log('⚠️  No hay archivos PDF en el directorio data/');
        } else {
            pdfFiles.forEach(file => {
                const filePath = path.join(DATA_DIR, file);
                const stats = fs.statSync(filePath);
                console.log(`  ✅ ${file} (${stats.size} bytes)`);
            });
        }
        
        // Verificar si los PDFs están indexados buscando sus nombres en metadatos
        console.log('\n🔍 Verificando si los PDFs están indexados:');
        const allMetadatas = await collection.get({
            include: ['metadatas']
        });
        
        const indexedSources = new Set();
        allMetadatas.metadatas.forEach(meta => {
            if (meta.source) {
                indexedSources.add(meta.source);
            }
        });
        
        pdfFiles.forEach(file => {
            if (indexedSources.has(file)) {
                console.log(`  ✅ ${file} - INDEXADO`);
            } else {
                console.log(`  ❌ ${file} - NO INDEXADO`);
            }
        });
        
        console.log('\n✅ Verificación completada');
        
    } catch (error) {
        console.error('❌ Error verificando ChromaDB:', error.message);
        console.log('💡 Asegúrate de que ChromaDB esté corriendo en:', CHROMA_HOST);
        console.log('   Inicia ChromaDB con: docker run -p 8000:8000 chromadb/chromadb');
    }
}

// Ejecutar verificación
verifyChromaDB();
