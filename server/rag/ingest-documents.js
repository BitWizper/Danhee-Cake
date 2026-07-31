/**
 * ingest-documents.js — Script para ingesta de documentos PDF con chunking
 * Implementa estrategia de fragmentación semántica para RAG
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { ChromaClient } = require('chromadb');
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { OllamaEmbeddings } = require("@langchain/community/embeddings/ollama");

// Configuración
const DATA_DIR = path.join(__dirname, 'data');
const CHROMA_HOST = process.env.CHROMA_HOST || 'http://localhost:8000';
const EMBEDDING_MODEL = 'nomic-embed-text';
const COLLECTION_NAME = 'danhee_knowledge';

// Configuración de chunking
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

// Configuración de TextSplitter
const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: ["\n\n", "\n", " ", ""]
});

// Función para limpiar texto
function cleanText(text) {
    if (!text) return '';
    
    // Eliminar espacios múltiples
    text = text.replace(/\s+/g, ' ');
    
    // Eliminar caracteres especiales problemáticos
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Normalizar saltos de línea
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    return text.trim();
}

// Función para leer PDF
async function readPDF(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return cleanText(data.text);
    } catch (error) {
        console.error(`Error leyendo PDF ${filePath}:`, error.message);
        return null;
    }
}

// Función para fragmentar texto con chunking
async function chunkText(text, metadata = {}) {
    try {
        const chunks = await textSplitter.splitText(text);
        
        return chunks.map((chunk, index) => ({
            text: chunk,
            metadata: {
                ...metadata,
                chunk_index: index,
                chunk_size: chunk.length,
                source: metadata.source || 'unknown'
            }
        }));
    } catch (error) {
        console.error('Error en chunking:', error.message);
        return [];
    }
}

// Función para generar embeddings
async function generateEmbeddings(texts) {
    try {
        const embeddings = new OllamaEmbeddings({
            model: EMBEDDING_MODEL
        });
        
        const embeddingVectors = await Promise.all(
            texts.map(text => embeddings.embedQuery(text))
        );
        
        return embeddingVectors;
    } catch (error) {
        console.error('Error generando embeddings:', error.message);
        return null;
    }
}

// Función principal de ingesta
async function ingestDocuments() {
    console.log('🚀 Iniciando ingesta de documentos...');
    console.log(`📁 Directorio de datos: ${DATA_DIR}`);
    console.log(`📡 ChromaDB: ${CHROMA_HOST}`);
    console.log(`🧠 Modelo de embeddings: ${EMBEDDING_MODEL}`);
    
    try {
        // Conectar a ChromaDB
        const client = new ChromaClient({ path: CHROMA_HOST });
        
        // Obtener o crear colección con métrica de similitud coseno
        const collection = await client.getOrCreateCollection({
            name: COLLECTION_NAME,
            metadata: { 
                description: 'Base de conocimiento de Danhee Cake',
                "hnsw:space": "cosine"  // Métrica de similitud coseno
            }
        });
        
        console.log(`✅ Colección '${COLLECTION_NAME}' lista`);
        
        // Leer archivos PDF del directorio
        const files = fs.readdirSync(DATA_DIR).filter(file => file.endsWith('.pdf'));
        console.log(`📄 Encontrados ${files.length} archivos PDF`);
        
        if (files.length === 0) {
            console.log('⚠️  No se encontraron archivos PDF para procesar');
            return;
        }
        
        let totalChunks = 0;
        
        for (const file of files) {
            const filePath = path.join(DATA_DIR, file);
            console.log(`\n📖 Procesando: ${file}`);
            
            // Leer PDF
            const text = await readPDF(filePath);
            if (!text) {
                console.log(`❌ No se pudo extraer texto de ${file}`);
                continue;
            }
            
            console.log(`   Texto extraído: ${text.length} caracteres`);
            
            // Fragmentar texto (chunking)
            const chunks = await chunkText(text, { source: file });
            console.log(`   Chunks generados: ${chunks.length}`);
            
            if (chunks.length === 0) {
                console.log(`❌ No se generaron chunks para ${file}`);
                continue;
            }
            
            // Generar embeddings para cada chunk
            const chunkTexts = chunks.map(c => c.text);
            const embeddings = await generateEmbeddings(chunkTexts);
            
            if (!embeddings) {
                console.log(`❌ Error generando embeddings para ${file}`);
                continue;
            }
            
            // Preparar datos para ChromaDB
            const ids = chunks.map((_, i) => `${file}_${Date.now()}_${i}`);
            const documents = chunks.map(c => c.text);
            const metadatas = chunks.map(c => c.metadata);
            
            // Agregar a ChromaDB
            await collection.add({
                ids: ids,
                embeddings: embeddings,
                documents: documents,
                metadatas: metadatas
            });
            
            totalChunks += chunks.length;
            console.log(`✅ ${chunks.length} chunks agregados a ChromaDB`);
        }
        
        // Verificar conteo final
        const finalCount = await collection.count();
        console.log(`\n📊 Total de documentos en colección: ${finalCount}`);
        console.log(`📊 Chunks agregados en esta ejecución: ${totalChunks}`);
        console.log('\n✅ Ingesta completada exitosamente');
        
    } catch (error) {
        console.error('❌ Error en ingesta:', error.message);
        process.exit(1);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    ingestDocuments().catch(error => {
        console.error('Error fatal:', error);
        process.exit(1);
    });
}

module.exports = { ingestDocuments };
