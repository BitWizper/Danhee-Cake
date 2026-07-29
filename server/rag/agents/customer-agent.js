/**
 * customer-agent.js — Agente especializado para clientes de Danhee Cake.
 * Versión JavaScript/Node.js equivalente a customer_agent.py
 */

const ollama = require('ollama');
const db = require('../db-config');
const { 
    getCachedResponse, setCachedResponse, shouldSkipRag, shouldUseTools,
    getOllamaOptionsCliente, obtenerRespuestaFija, checkGuardrails,
    detectarFormalidad, setCurrentClientId, getCurrentClientId
} = require('../tools/common-tools');
const { TOOLS_SCHEMA, resolveToolName, executeTool } = require('../tools/registry');

class CustomerAgent {
    constructor(ragAgent = null) {
        this.ragAgent = ragAgent;
        this.systemPrompt = this.buildSystemPrompt();
    }

    buildSystemPrompt() {
        return (
            'Eres un asistente virtual amable y profesional de Danhee Cake, una plataforma de repostería personalizada.\n\n' +
            'Tu rol es ayudar a los clientes a:\n' +
            '• Explorar el catálogo de pasteles y encontrar opciones según sus necesidades\n' +
            '• Agendar citas de degustación con reposteros\n' +
            '• Consultar precios, categorías y disponibilidad\n' +
            '• Recibir recomendaciones personalizadas\n\n' +
            'Directrices:\n' +
            '• Siempre responde en español de México\n' +
            '• Usa un tono cálido, empático y servicial\n' +
            '• Si no encuentras información exacta, ofrece alternativas cercanas\n' +
            '• Para agendar citas, pide fecha y hora específicas\n' +
            '• Nunca inventes datos de pasteles, precios o reposteros que no existan en la base de datos\n' +
            '• Si el usuario pregunta algo fuera de contexto, redirige amablemente a temas de Danhee Cake\n\n' +
            'Tienes acceso a herramientas que puedes invocar cuando sea necesario para obtener información actualizada.'
        );
    }

    async processMessage(conversationId, userMessage, clientId = null, streamingCallback = null) {
        if (clientId) {
            setCurrentClientId(clientId);
        }

        const fixedResponse = obtenerRespuestaFija(userMessage);
        if (fixedResponse) {
            await db.addChatMessage(conversationId, 'user', userMessage);
            await db.addChatMessage(conversationId, 'assistant', fixedResponse);
            return { response: fixedResponse, toolCalls: null, wasBlocked: false };
        }

        if (checkGuardrails(userMessage)) {
            await db.addChatMessage(conversationId, 'user', userMessage);
            const blockedMsg = 'Lo siento, no puedo procesar esa solicitud. ¿En qué más te puedo ayudar con pasteles o citas?';
            await db.addChatMessage(conversationId, 'assistant', blockedMsg);
            return { response: blockedMsg, toolCalls: null, wasBlocked: true };
        }

        const cached = getCachedResponse(userMessage, 'cliente', conversationId);
        if (cached) {
            await db.addChatMessage(conversationId, 'user', userMessage);
            await db.addChatMessage(conversationId, 'assistant', cached);
            return { response: cached, toolCalls: null, wasBlocked: false };
        }

        await db.getOrCreateChatSession(conversationId, clientId);
        const chatHistory = await db.getChatHistory(conversationId, this.systemPrompt);

        let context = '';
        let toolResults = [];
        let toolCalls = [];

        const useTools = shouldUseTools(userMessage, 'cliente');
        const skipRag = shouldSkipRag(userMessage);

        if (useTools && this.ragAgent && !skipRag) {
            try {
                const contextDocs = await this.ragAgent.retrieveContext(userMessage, 3);
                if (contextDocs.length > 0) {
                    context = this.ragAgent.formatContextForLLM(contextDocs);
                }
            } catch (e) {
                console.error(`[CustomerAgent] Error en RAG: ${e.message}`);
            }
        }

        const messages = [...chatHistory, { role: 'user', content: userMessage }];
        if (context) {
            messages[messages.length - 1].content = `Contexto relevante:\n${context}\n\nPregunta del usuario: ${userMessage}`;
        }

        const options = getOllamaOptionsCliente();
        let responseText = '';
        let ttftMs = 0;
        let startTime = Date.now();

        try {
            if (useTools) {
                const toolResponse = await ollama.chat({
                    model: 'llama3.1',
                    messages,
                    tools: TOOLS_SCHEMA,
                    options,
                    stream: false
                });

                if (toolResponse.message.tool_calls && toolResponse.message.tool_calls.length > 0) {
                    toolCalls = toolResponse.message.tool_calls;
                    
                    for (const toolCall of toolCalls) {
                        const toolName = toolCall.function.name;
                        const toolArgs = JSON.parse(toolCall.function.arguments);
                        
                        try {
                            const result = await executeTool(toolName, toolArgs);
                            toolResults.push({ toolName, result });
                            
                            const resultText = typeof result === 'object' ? JSON.stringify(result) : String(result);
                            messages.push({ role: 'tool', content: resultText, tool_call_id: toolCall.id });
                        } catch (e) {
                            console.error(`[CustomerAgent] Error ejecutando ${toolName}: ${e.message}`);
                            messages.push({ role: 'tool', content: `Error: ${e.message}`, tool_call_id: toolCall.id });
                        }
                    }

                    const finalResponse = await ollama.chat({
                        model: 'llama3.1',
                        messages,
                        options,
                        stream: false
                    });

                    responseText = finalResponse.message.content;
                } else {
                    responseText = toolResponse.message.content;
                }
            } else {
                const response = await ollama.chat({
                    model: 'llama3.1',
                    messages,
                    options,
                    stream: false
                });
                responseText = response.message.content;
            }

            ttftMs = Date.now() - startTime;

        } catch (e) {
            console.error(`[CustomerAgent] Error en Ollama: ${e.message}`);
            responseText = 'Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.';
        }

        const filteredResponse = this.filterAlucinatoryResponse(responseText, userMessage);
        
        await db.addChatMessage(conversationId, 'user', userMessage);
        await db.addChatMessage(conversationId, 'assistant', filteredResponse, toolCalls.length > 0 ? toolCalls : null);
        
        setCachedResponse(userMessage, 'cliente', filteredResponse, conversationId);

        const totalLatencyMs = Date.now() - startTime;
        const tokensPerSecond = responseText.length / (totalLatencyMs / 1000) || 0;

        await db.addObservabilityLog(
            conversationId,
            userMessage,
            filteredResponse,
            ttftMs,
            totalLatencyMs,
            tokensPerSecond,
            false,
            toolResults.map(t => t.toolName)
        );

        return {
            response: filteredResponse,
            toolCalls: toolCalls.length > 0 ? toolCalls : null,
            wasBlocked: false
        };
    }

    filterAlucinatoryResponse(response, originalQuery) {
        if (!response) return response;

        const responseLower = response.toLowerCase();
        
        const forbiddenPhrases = [
            'no tengo acceso a esa información',
            'no estoy seguro',
            'no lo sé',
            'no puedo confirmar',
            'no tengo datos',
            'información no disponible',
            'no encontré información'
        ];

        const hasForbidden = forbiddenPhrases.some(phrase => responseLower.includes(phrase));
        
        if (hasForbidden && response.length < 200) {
            return 'Lo siento, no encontré información específica sobre eso en mi base de datos. ¿Te gustaría que te ayude con otra consulta sobre pasteles o citas de degustación?';
        }

        return response;
    }

    async processStreaming(conversationId, userMessage, clientId = null) {
        if (clientId) {
            setCurrentClientId(clientId);
        }

        const fixedResponse = obtenerRespuestaFija(userMessage);
        if (fixedResponse) {
            await db.addChatMessage(conversationId, 'user', userMessage);
            await db.addChatMessage(conversationId, 'assistant', fixedResponse);
            return { response: fixedResponse, wasBlocked: false };
        }

        if (checkGuardrails(userMessage)) {
            await db.addChatMessage(conversationId, 'user', userMessage);
            const blockedMsg = 'Lo siento, no puedo procesar esa solicitud.';
            await db.addChatMessage(conversationId, 'assistant', blockedMsg);
            return { response: blockedMsg, wasBlocked: true };
        }

        await db.getOrCreateChatSession(conversationId, clientId);
        const chatHistory = await db.getChatHistory(conversationId, this.systemPrompt);

        const messages = [...chatHistory, { role: 'user', content: userMessage }];
        const options = getOllamaOptionsCliente();

        try {
            const stream = await ollama.chat({
                model: 'llama3.1',
                messages,
                options,
                stream: true
            });

            let fullResponse = '';
            
            for await (const chunk of stream) {
                if (chunk.message && chunk.message.content) {
                    fullResponse += chunk.message.content;
                }
            }

            await db.addChatMessage(conversationId, 'user', userMessage);
            await db.addChatMessage(conversationId, 'assistant', fullResponse);

            return { response: fullResponse, wasBlocked: false };
        } catch (e) {
            console.error(`[CustomerAgent] Error en streaming: ${e.message}`);
            return { response: 'Error al procesar la solicitud.', wasBlocked: false };
        }
    }

    detectAppointmentIntention(message) {
        const keywords = ['cita', 'agendar', 'reservar', 'programar', 'visita', 'degustacion', 'degustación'];
        const lowerMsg = message.toLowerCase();
        return keywords.some(k => lowerMsg.includes(k));
    }
}

module.exports = CustomerAgent;
