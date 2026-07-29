/**
 * rag-agent.js — Agente RAG avanzado para búsqueda híbrida y reranking en Danhee Cake.
 * Versión JavaScript/Node.js equivalente a rag_agent.py
 */

const ollama = require('ollama');

class AdvancedRAGAgent {
    constructor(chromaClient, embeddingModel = 'nomic-embed-text') {
        this.chromaClient = chromaClient;
        this.embeddingModel = embeddingModel;
        this.collectionName = 'danhee_knowledge';
    }

    async initialize() {
        try {
            await this.chromaClient.getOrCreateCollection({
                name: this.collectionName,
                metadata: { description: 'Base de conocimiento de Danhee Cake' }
            });
            console.error('[AdvancedRAGAgent] ✅ Colección Chroma inicializada');
        } catch (e) {
            console.error(`[AdvancedRAGAgent] ⚠️ Error inicializando Chroma: ${e.message}`);
        }
    }

    async getEmbedding(text) {
        try {
            const response = await ollama.embeddings({
                model: this.embeddingModel,
                prompt: text
            });
            return response.embedding;
        } catch (e) {
            console.error(`[AdvancedRAGAgent] Error generando embedding: ${e.message}`);
            return null;
        }
    }

    async hybridSearch(query, topK = 5) {
        try {
            const embedding = await this.getEmbedding(query);
            if (!embedding) return [];

            const collection = await this.chromaClient.getCollection({ name: this.collectionName });
            
            const results = await collection.query({
                queryEmbeddings: [embedding],
                nResults: topK
            });

            if (!results.documents || results.documents.length === 0) return [];

            const contextDocs = results.documents[0].map((doc, i) => ({
                text: doc,
                metadata: results.metadatas ? results.metadatas[0][i] : {},
                distance: results.distances ? results.distances[0][i] : 0
            }));

            return contextDocs;
        } catch (e) {
            console.error(`[AdvancedRAGAgent] Error en hybridSearch: ${e.message}`);
            return [];
        }
    }

    async rerankResults(query, documents) {
        if (documents.length === 0) return documents;

        try {
            const queryEmbedding = await this.getEmbedding(query);
            if (!queryEmbedding) return documents;

            const docsWithScores = await Promise.all(
                documents.map(async (doc) => {
                    const docEmbedding = await this.getEmbedding(doc.text);
                    if (!docEmbedding) return { ...doc, rerankScore: 0 };

                    const similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);
                    return { ...doc, rerankScore: similarity };
                })
            );

            return docsWithScores.sort((a, b) => b.rerankScore - a.rerankScore);
        } catch (e) {
            console.error(`[AdvancedRAGAgent] Error en rerankResults: ${e.message}`);
            return documents;
        }
    }

    cosineSimilarity(vecA, vecB) {
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

    async retrieveContext(query, topK = 5) {
        const docs = await this.hybridSearch(query, topK);
        const reranked = await this.rerankResults(query, docs);
        
        return reranked.slice(0, topK);
    }

    formatContextForLLM(contextDocs) {
        if (contextDocs.length === 0) return '';

        return contextDocs
            .map((doc, i) => `[Contexto ${i + 1}]: ${doc.text}`)
            .join('\n\n');
    }
}

module.exports = AdvancedRAGAgent;
