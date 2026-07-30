/**
 * baker-agent.js — Agente especializado para reposteros de Danhee Cake.
 * Versión JavaScript/Node.js equivalente a baker_agent.py
 * Migrado a LangChain.js
 */

const { ChatOllama } = require("@langchain/community/chat_models/ollama");
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const db = require('../db-config');
const { 
    getOllamaOptions, checkGuardrails, detectarFormalidad,
    setCurrentClientId, getCurrentClientId
} = require('../tools/common-tools');
const { BAKER_TOOLS_SCHEMA, resolveToolName, executeTool } = require('../tools/registry');

class BakerAgent {
    constructor() {
        this.systemPrompt = this.buildSystemPrompt();
        
        // Inicializar ChatOllama con LangChain
        this.llm = new ChatOllama({
            model: "llama3.2:latest",
            temperature: 0.6,
            numPredict: 2048,
            topK: 40,
            topP: 0.9
        });
    }

    buildSystemPrompt() {
        return (
            'Eres un asistente virtual profesional y eficiente para reposteros de Danhee Cake.\n\n' +
            'Tu rol es ayudar a los reposteros a:\n' +
            '• Gestionar su catálogo de pasteles (listar, agregar, actualizar, eliminar)\n' +
            '• Consultar y gestionar sus citas de degustación\n' +
            '• Consultar categorías disponibles\n' +
            '• Obtener información de su perfil y contexto\n\n' +
            'Directrices:\n' +
            '• Siempre responde en español de México\n' +
            '• Usa un tono profesional pero cercano\n' +
            '• Sé conciso y directo en tus respuestas\n' +
            '• Confirma las acciones de modificación de datos antes de ejecutarlas\n' +
            '• Para actualizaciones directas de precio o eliminación, ejecuta la acción inmediatamente\n' +
            '• Adapta tu tono según la formalidad detectada en el mensaje del repostero\n\n' +
            'Tienes acceso a herramientas específicas para gestionar tu catálogo y citas.'
        );
    }

    async processMessage(conversationId, userMessage, bakerUserId = null, streamingCallback = null) {
        if (bakerUserId) {
            setCurrentClientId(bakerUserId);
        }

        if (checkGuardrails(userMessage)) {
            await db.addChatMessage(conversationId, 'user', userMessage);
            const blockedMsg = 'Lo siento, no puedo procesar esa solicitud.';
            await db.addChatMessage(conversationId, 'assistant', blockedMsg);
            return { response: blockedMsg, toolCalls: null, wasBlocked: true };
        }

        await db.getOrCreateChatSession(conversationId, bakerUserId);
        const chatHistory = await db.getChatHistory(conversationId, this.systemPrompt);

        const formality = detectarFormalidad(userMessage);
        const adaptedPrompt = this.adaptPromptByFormality(this.systemPrompt, formality);

        const messages = [...chatHistory, { role: 'user', content: userMessage }];
        const options = getOllamaOptions();

        // Convertir mensajes a formato LangChain
        const langchainMessages = [
            new SystemMessage(adaptedPrompt),
            ...chatHistory.map(msg => {
                if (msg.role === 'user') return new HumanMessage(msg.content);
                if (msg.role === 'assistant') return new AIMessage(msg.content);
                return new HumanMessage(msg.content);
            }),
            new HumanMessage(userMessage)
        ];

        let toolResults = [];
        let toolCalls = [];

        try {
            // Para tools, usamos cliente directo Ollama (LangChain tools requiere más configuración)
            const ollama = require('ollama');
            const toolResponse = await ollama.chat({
                model: 'llama3.2:latest',
                messages,
                tools: BAKER_TOOLS_SCHEMA,
                options,
                stream: false
            });

            let responseText = '';

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
                        console.error(`[BakerAgent] Error ejecutando ${toolName}: ${e.message}`);
                        messages.push({ role: 'tool', content: `Error: ${e.message}`, tool_call_id: toolCall.id });
                    }
                }

                const finalResponse = await ollama.chat({
                    model: 'llama3.2:latest',
                    messages,
                    options,
                    stream: false
                });

                responseText = finalResponse.message.content;
            } else {
                // Sin tools, usar LangChain ChatOllama
                const response = await this.llm.invoke(langchainMessages);
                responseText = response.content;
            }

            const filteredResponse = this.filterResponse(responseText, userMessage);
            
            await db.addChatMessage(conversationId, 'user', userMessage);
            await db.addChatMessage(conversationId, 'assistant', filteredResponse, toolCalls.length > 0 ? toolCalls : null);

            return {
                response: filteredResponse,
                toolCalls: toolCalls.length > 0 ? toolCalls : null,
                wasBlocked: false
            };

        } catch (e) {
            console.error(`[BakerAgent] Error en LangChain/Ollama: ${e.message}`);
            // Fallback a cliente directo completo
            try {
                const ollama = require('ollama');
                const toolResponse = await ollama.chat({
                    model: 'llama3.2:latest',
                    messages,
                    tools: BAKER_TOOLS_SCHEMA,
                    options,
                    stream: false
                });

                let responseText = '';

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
                            console.error(`[BakerAgent] Error ejecutando ${toolName}: ${e.message}`);
                            messages.push({ role: 'tool', content: `Error: ${e.message}`, tool_call_id: toolCall.id });
                        }
                    }

                    const finalResponse = await ollama.chat({
                        model: 'llama3.2:latest',
                        messages,
                        options,
                        stream: false
                    });

                    responseText = finalResponse.message.content;
                } else {
                    responseText = toolResponse.message.content;
                }

                const filteredResponse = this.filterResponse(responseText, userMessage);
                
                await db.addChatMessage(conversationId, 'user', userMessage);
                await db.addChatMessage(conversationId, 'assistant', filteredResponse, toolCalls.length > 0 ? toolCalls : null);

                return {
                    response: filteredResponse,
                    toolCalls: toolCalls.length > 0 ? toolCalls : null,
                    wasBlocked: false
                };
            } catch (fallbackError) {
                console.error(`[BakerAgent] Error en fallback: ${fallbackError.message}`);
                const errorMsg = 'Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.';
                await db.addChatMessage(conversationId, 'user', userMessage);
                await db.addChatMessage(conversationId, 'assistant', errorMsg);
                return { response: errorMsg, toolCalls: null, wasBlocked: false };
            }
        }
    }

    adaptPromptByFormality(basePrompt, formality) {
        if (formality === 'formal') {
            return basePrompt.replace('cercano', 'formal y respetuoso');
        } else if (formality === 'casual') {
            return basePrompt.replace('profesional pero cercano', 'amigable y relajado');
        }
        return basePrompt;
    }

    filterResponse(response, originalQuery) {
        if (!response) return response;

        const lowerMsg = originalQuery.toLowerCase();
        const lowerResponse = response.toLowerCase();

        if (/actualizar.*precio|cambiar.*precio|modificar.*precio/.test(lowerMsg)) {
            return response;
        }

        if (/eliminar.*pastel|borrar.*pastel|quitar.*pastel/.test(lowerMsg)) {
            return response;
        }

        return response;
    }

    async processStreaming(conversationId, userMessage, bakerUserId = null) {
        if (bakerUserId) {
            setCurrentClientId(bakerUserId);
        }

        if (checkGuardrails(userMessage)) {
            await db.addChatMessage(conversationId, 'user', userMessage);
            const blockedMsg = 'Lo siento, no puedo procesar esa solicitud.';
            await db.addChatMessage(conversationId, 'assistant', blockedMsg);
            return { response: blockedMsg, wasBlocked: true };
        }

        await db.getOrCreateChatSession(conversationId, bakerUserId);
        const chatHistory = await db.getChatHistory(conversationId, this.systemPrompt);

        // Convertir mensajes a formato LangChain
        const langchainMessages = [
            new SystemMessage(this.systemPrompt),
            ...chatHistory.map(msg => {
                if (msg.role === 'user') return new HumanMessage(msg.content);
                if (msg.role === 'assistant') return new AIMessage(msg.content);
                return new HumanMessage(msg.content);
            }),
            new HumanMessage(userMessage)
        ];

        try {
            // Usar LangChain ChatOllama para streaming
            const stream = await this.llm.stream(langchainMessages);
            
            let fullResponse = '';
            
            for await (const chunk of stream) {
                if (chunk.content) {
                    fullResponse += chunk.content;
                }
            }

            await db.addChatMessage(conversationId, 'user', userMessage);
            await db.addChatMessage(conversationId, 'assistant', fullResponse);

            return { response: fullResponse, wasBlocked: false };
        } catch (e) {
            console.error(`[BakerAgent] Error en streaming LangChain: ${e.message}`);
            // Fallback a cliente directo
            try {
                const ollama = require('ollama');
                const messages = [...chatHistory, { role: 'user', content: userMessage }];
                const options = getOllamaOptions();
                const stream = await ollama.chat({
                    model: 'llama3.2:latest',
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
            } catch (fallbackError) {
                console.error(`[BakerAgent] Error en fallback streaming: ${fallbackError.message}`);
                return { response: 'Error al procesar la solicitud.', wasBlocked: false };
            }
        }
    }
}

module.exports = BakerAgent;
