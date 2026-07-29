/**
 * router.js — TaskRouter que orquesta el enrutamiento de solicitudes a los agentes apropiados.
 * Versión JavaScript/Node.js equivalente a router.py
 */

const CustomerAgent = require('./customer-agent');
const BakerAgent = require('./baker-agent');
const AdvancedRAGAgent = require('./rag-agent');

class TaskRouter {
    constructor(chromaClient = null) {
        this.ragAgent = chromaClient ? new AdvancedRAGAgent(chromaClient) : null;
        this.customerAgent = new CustomerAgent(this.ragAgent);
        this.bakerAgent = new BakerAgent();
        
        if (this.ragAgent) {
            this.ragAgent.initialize();
        }
    }

    async route(conversationId, userMessage, userRole, userId = null, streamingCallback = null) {
        if (!userRole) {
            userRole = 'cliente';
        }

        const normalizedRole = userRole.toLowerCase().trim();

        if (normalizedRole === 'repostero' || normalizedRole === 'baker' || normalizedRole === 'reposteros') {
            return await this.bakerAgent.processMessage(conversationId, userMessage, userId, streamingCallback);
        } else {
            return await this.customerAgent.processMessage(conversationId, userMessage, userId, streamingCallback);
        }
    }

    async routeStreaming(conversationId, userMessage, userRole, userId = null) {
        if (!userRole) {
            userRole = 'cliente';
        }

        const normalizedRole = userRole.toLowerCase().trim();

        if (normalizedRole === 'repostero' || normalizedRole === 'baker' || normalizedRole === 'reposteros') {
            return await this.bakerAgent.processStreaming(conversationId, userMessage, userId);
        } else {
            return await this.customerAgent.processStreaming(conversationId, userMessage, userId);
        }
    }

    getCustomerAgent() {
        return this.customerAgent;
    }

    getBakerAgent() {
        return this.bakerAgent;
    }

    getRagAgent() {
        return this.ragAgent;
    }
}

module.exports = TaskRouter;
