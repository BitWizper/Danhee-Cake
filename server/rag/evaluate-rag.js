/**
 * evaluate-rag.js — Script para evaluación de métricas RAG básicas
 * Implementa: Context Precision, Context Recall, Faithfulness, Answer Relevancy
 */

const { ChromaClient } = require('chromadb');
const { OllamaEmbeddings } = require("@langchain/community/embeddings/ollama");
const { Ollama } = require("@langchain/community/llms/ollama");

const CHROMA_HOST = process.env.CHROMA_HOST || 'http://localhost:8000';
const EMBEDDING_MODEL = 'nomic-embed-text';
const LLM_MODEL = 'llama3.2:latest';
const COLLECTION_NAME = 'danhee_knowledge';

// Función para calcular similitud coseno
function cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Función para generar embeddings
async function getEmbedding(text) {
    try {
        const embeddings = new OllamaEmbeddings({ model: EMBEDDING_MODEL });
        return await embeddings.embedQuery(text);
    } catch (error) {
        console.error('Error generando embedding:', error.message);
        return null;
    }
}

// Context Precision: Evalúa si los fragmentos recuperados son relevantes
async function evaluateContextPrecision(query, retrievedDocs, relevantDocs) {
    if (retrievedDocs.length === 0) return 0;
    
    let precisionSum = 0;
    for (let i = 0; i < retrievedDocs.length; i++) {
        const isRelevant = relevantDocs.some(doc => 
            doc.text.includes(retrievedDocs[i].text.substring(0, 50))
        );
        precisionSum += isRelevant ? 1 : 0;
    }
    
    return precisionSum / retrievedDocs.length;
}

// Context Recall: Mide si se recuperó toda la información necesaria
async function evaluateContextRecall(query, retrievedDocs, groundTruthDocs) {
    if (groundTruthDocs.length === 0) return 1;
    
    let recalledCount = 0;
    for (const truthDoc of groundTruthDocs) {
        const truthEmbedding = await getEmbedding(truthDoc.text);
        let isRecalled = false;
        
        for (const doc of retrievedDocs) {
            const docEmbedding = await getEmbedding(doc.text);
            if (cosineSimilarity(truthEmbedding, docEmbedding) > 0.7) {
                isRecalled = true;
                break;
            }
        }
        
        if (isRecalled) recalledCount++;
    }
    
    return recalledCount / groundTruthDocs.length;
}

// Faithfulness: Verifica que la respuesta se base solo en el contexto
async function evaluateFaithfulness(answer, context) {
    try {
        const llm = new Ollama({ model: LLM_MODEL });
        
        const prompt = `
Contexto: ${context}
Respuesta: ${answer}

Evalúa si la respuesta se basa ÚNICAMENTE en el contexto proporcionado.
Responde con un número del 0 al 1, donde 1 es completamente fiel al contexto y 0 es completamente alucinada.
Solo responde con el número, sin explicación.`;
        
        const response = await llm.invoke(prompt);
        const score = parseFloat(response.content.trim());
        
        return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
    } catch (error) {
        console.error('Error evaluando faithfulness:', error.message);
        return 0.5;
    }
}

// Answer Relevancy: Califica qué tan directamente responde la pregunta
async function evaluateAnswerRelevancy(query, answer) {
    try {
        const llm = new Ollama({ model: LLM_MODEL });
        
        const prompt = `
Pregunta: ${query}
Respuesta: ${answer}

Evalúa qué tan directamente la respuesta aborda la pregunta.
Responde con un número del 0 al 1, donde 1 es completamente relevante y 0 es completamente irrelevante.
Solo responde con el número, sin explicación.`;
        
        const response = await llm.invoke(prompt);
        const score = parseFloat(response.content.trim());
        
        return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
    } catch (error) {
        console.error('Error evaluando answer relevancy:', error.message);
        return 0.5;
    }
}

// Función principal de evaluación
async function evaluateRAG(query, retrievedDocs, answer, groundTruthDocs = []) {
    console.log('📊 Evaluando métricas RAG...');
    
    const metrics = {
        context_precision: 0,
        context_recall: 0,
        faithfulness: 0,
        answer_relevancy: 0
    };
    
    try {
        // Context Precision
        metrics.context_precision = await evaluateContextPrecision(query, retrievedDocs, groundTruthDocs);
        console.log(`📈 Context Precision: ${metrics.context_precision.toFixed(2)}`);
        
        // Context Recall
        metrics.context_recall = await evaluateContextRecall(query, retrievedDocs, groundTruthDocs);
        console.log(`📈 Context Recall: ${metrics.context_recall.toFixed(2)}`);
        
        // Faithfulness
        const context = retrievedDocs.map(doc => doc.text).join('\n\n');
        metrics.faithfulness = await evaluateFaithfulness(answer, context);
        console.log(`📈 Faithfulness: ${metrics.faithfulness.toFixed(2)}`);
        
        // Answer Relevancy
        metrics.answer_relevancy = await evaluateAnswerRelevancy(query, answer);
        console.log(`📈 Answer Relevancy: ${metrics.answer_relevancy.toFixed(2)}`);
        
        // Promedio general
        const average = (metrics.context_precision + metrics.context_recall + 
                        metrics.faithfulness + metrics.answer_relevancy) / 4;
        console.log(`📈 Promedio General: ${average.toFixed(2)}`);
        
        return metrics;
        
    } catch (error) {
        console.error('❌ Error en evaluación RAG:', error.message);
        return metrics;
    }
}

// Ejemplo de uso
async function runExampleEvaluation() {
    console.log('🧪 Ejemplo de evaluación RAG\n');
    
    const query = '¿Qué categorías de pasteles ofrece Danhee Cake?';
    const answer = 'Danhee Cake ofrece categorías como Cumpleaños, Bodas, XV Años, Baby Shower, Aniversarios, Graduaciones, Eventos Corporativos y Diseños Personalizados.';
    
    const retrievedDocs = [
        { text: 'Las categorías de pasteles disponibles incluyen: Cumpleaños, Bodas, XV Años, Baby Shower, Aniversarios, Graduaciones, Eventos Corporativos y Diseños Personalizados.' }
    ];
    
    const metrics = await evaluateRAG(query, retrievedDocs, answer);
    
    console.log('\n✅ Evaluación completada');
    return metrics;
}

// Ejecutar ejemplo si se llama directamente
if (require.main === module) {
    runExampleEvaluation().catch(error => {
        console.error('Error fatal:', error);
        process.exit(1);
    });
}

module.exports = { evaluateRAG, evaluateContextPrecision, evaluateContextRecall, evaluateFaithfulness, evaluateAnswerRelevancy };
