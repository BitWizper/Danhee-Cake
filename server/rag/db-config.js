/**
 * db-config.js — Módulo de acceso a datos para el microservicio RAG de Danhee Cake.
 * Versión JavaScript/Node.js equivalente a db_config.py
 */

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Pool de conexiones persistente
let pool = null;
const CACHE_TTL = 120; // segundos
const cache = new Map();

function getPool() {
    if (pool === null) {
        try {
            pool = mysql.createPool({
                poolSize: 1,
                host: process.env.DB_HOST,
                port: parseInt(process.env.DB_PORT || '3306'),
                database: process.env.DB_NAME,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                connectionTimeout: 20000,
                waitForConnections: true,
                queueLimit: 0
            });
            console.error('[db-config] ✅ Pool de conexiones MySQL creado (size=1)');
        } catch (e) {
            console.error(`[db-config] ❌ Error creando pool: ${e.message}`);
            pool = null;
        }
    }
    return pool;
}

async function getConnection() {
    const currentPool = getPool();
    if (currentPool) {
        try {
            return await currentPool.getConnection();
        } catch (e) {
            console.error(`[db-config] Pool error, fallback a conexión directa: ${e.message}`);
        }
    }
    // Fallback a conexión directa
    try {
        return await mysql.createConnection({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '3306'),
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        });
    } catch (e) {
        console.error(`[db-config] Error conectando a MySQL: ${e.message}`);
        return null;
    }
}

// Cache en memoria
function cacheGet(key) {
    const entry = cache.get(key);
    if (entry && (Date.now() - entry.ts) < (CACHE_TTL * 1000)) {
        return entry.data;
    }
    return null;
}

function cacheSet(key, data) {
    cache.set(key, { data, ts: Date.now() });
}

// Funciones de acceso a datos
async function getCakes() {
    const cached = cacheGet('cakes');
    if (cached !== null) return cached;
    
    const conn = await getConnection();
    if (!conn) return [];
    
    try {
        const [rows] = await conn.execute(`
            SELECT c.*, cat.name as category_name, b.business_name
            FROM cakes c
            LEFT JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN baker_profiles b ON c.baker_id = b.id
        `);
        cacheSet('cakes', rows);
        return rows;
    } catch (e) {
        console.error(`[db-config] Error en getCakes: ${e.message}`);
        return [];
    } finally {
        conn.release();
    }
}

async function getBakers() {
    const cached = cacheGet('bakers');
    if (cached !== null) return cached;
    
    const conn = await getConnection();
    if (!conn) return [];
    
    try {
        const [rows] = await conn.execute('SELECT * FROM baker_profiles');
        cacheSet('bakers', rows);
        return rows;
    } catch (e) {
        console.error(`[db-config] Error en getBakers: ${e.message}`);
        return [];
    } finally {
        conn.release();
    }
}

async function getBakerById(bakerId) {
    const key = `baker_${bakerId}`;
    const cached = cacheGet(key);
    if (cached !== null) return cached;
    
    const conn = await getConnection();
    if (!conn) return null;
    
    try {
        const [rows] = await conn.execute(`
            SELECT b.*, u.name, u.avatar_url, u.email
            FROM baker_profiles b
            JOIN users u ON b.user_id = u.id
            WHERE b.id = ?
        `, [bakerId]);
        const result = rows[0] || null;
        cacheSet(key, result);
        return result;
    } catch (e) {
        console.error(`[db-config] Error en getBakerById: ${e.message}`);
        return null;
    } finally {
        conn.release();
    }
}

async function getAppointmentsByBakerDate(bakerId, dateStr) {
    const conn = await getConnection();
    if (!conn) return [];
    
    try {
        const [rows] = await conn.execute(
            'SELECT * FROM appointments WHERE baker_id = ? AND date = ?',
            [bakerId, dateStr]
        );
        return rows;
    } catch (e) {
        console.error(`[db-config] Error en getAppointmentsByBakerDate: ${e.message}`);
        return [];
    } finally {
        conn.release();
    }
}

async function insertAppointment(clientId, bakerId, dateStr, timeSlot, notes, status = 'pending') {
    const conn = await getConnection();
    if (!conn) return false;
    
    try {
        await conn.execute(`
            INSERT INTO appointments (client_id, baker_id, date, time_slot, notes, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [clientId, bakerId, dateStr, timeSlot, notes, status]);
        return true;
    } catch (e) {
        console.error(`[db-config] Error en insertAppointment: ${e.message}`);
        return false;
    } finally {
        conn.release();
    }
}

async function insertGuestAppointment(bakerId, dateStr, timeSlot, notes, status = 'pending') {
    const conn = await getConnection();
    if (!conn) return false;
    
    try {
        await conn.execute(`
            INSERT INTO appointments (baker_id, date, time_slot, notes, status)
            VALUES (?, ?, ?, ?, ?)
        `, [bakerId, dateStr, timeSlot, notes, status]);
        return true;
    } catch (e) {
        console.error(`[db-config] Error en insertGuestAppointment: ${e.message}`);
        return false;
    } finally {
        conn.release();
    }
}

async function getCategories() {
    const cached = cacheGet('categories');
    if (cached !== null) return cached;
    
    const conn = await getConnection();
    if (!conn) return [];
    
    try {
        const [rows] = await conn.execute('SELECT * FROM categories WHERE is_active = 1');
        cacheSet('categories', rows);
        return rows;
    } catch (e) {
        console.error(`[db-config] Error en getCategories: ${e.message}`);
        return [];
    } finally {
        conn.release();
    }
}

async function getUserById(userId) {
    if (!userId) return null;
    const key = `user_${userId}`;
    const cached = cacheGet(key);
    if (cached !== null) return cached;
    
    const conn = await getConnection();
    if (!conn) return null;
    
    try {
        const [rows] = await conn.execute(
            'SELECT id, name, email, role, avatar_url FROM users WHERE id = ?',
            [userId]
        );
        const result = rows[0] || null;
        cacheSet(key, result);
        return result;
    } catch (e) {
        console.error(`[db-config] Error en getUserById: ${e.message}`);
        return null;
    } finally {
        conn.release();
    }
}

async function getOrCreateChatSession(conversationId, clientId = null) {
    const conn = await getConnection();
    if (!conn) return false;
    
    try {
        const [rows] = await conn.execute(
            'SELECT conversation_id FROM chat_sessions WHERE conversation_id = ?',
            [conversationId]
        );
        if (rows.length > 0) return true;
        
        await conn.execute(
            'INSERT INTO chat_sessions (conversation_id, client_id) VALUES (?, ?)',
            [conversationId, clientId]
        );
        return true;
    } catch (e) {
        console.error(`[db-config] Error en getOrCreateChatSession: ${e.message}`);
        return false;
    } finally {
        conn.release();
    }
}

async function getChatHistory(conversationId, systemPrompt, maxTurns = 12) {
    const conn = await getConnection();
    if (!conn) return [{ role: 'system', content: systemPrompt }];
    
    try {
        const [rows] = await conn.execute(`
            SELECT role, content
            FROM chat_messages
            WHERE conversation_id = ?
              AND role IN ('user', 'assistant')
              AND content IS NOT NULL
              AND TRIM(content) != ''
            ORDER BY id DESC
            LIMIT ?
        `, [conversationId, maxTurns * 2]);
        
        const reversedRows = rows.reverse();
        const messages = [{ role: 'system', content: systemPrompt }];
        
        for (const row of reversedRows) {
            const content = String(row.content || '').trim();
            if (content) {
                messages.push({ role: row.role, content });
            }
        }
        return messages;
    } catch (e) {
        console.error(`[db-config] Error en getChatHistory: ${e.message}`);
        return [{ role: 'system', content: systemPrompt }];
    } finally {
        conn.release();
    }
}

async function getLastConversationByClient(clientId) {
    const conn = await getConnection();
    if (!conn) return null;
    
    try {
        const [rows] = await conn.execute(`
            SELECT conversation_id
            FROM chat_sessions
            WHERE client_id = ?
            ORDER BY updated_at DESC
            LIMIT 1
        `, [clientId]);
        return rows[0] ? rows[0].conversation_id : null;
    } catch (e) {
        console.error(`[db-config] Error en getLastConversationByClient: ${e.message}`);
        return null;
    } finally {
        conn.release();
    }
}

async function getChatMessages(conversationId) {
    const conn = await getConnection();
    if (!conn) return [];
    
    try {
        const [rows] = await conn.execute(`
            SELECT role, content, tool_calls
            FROM chat_messages
            WHERE conversation_id = ?
            ORDER BY id ASC
        `, [conversationId]);
        
        for (const row of rows) {
            if (row.tool_calls) {
                try {
                    row.tool_calls = JSON.parse(row.tool_calls);
                } catch (e) {
                    // Keep as string if parse fails
                }
            }
        }
        return rows;
    } catch (e) {
        console.error(`[db-config] Error en getChatMessages: ${e.message}`);
        return [];
    } finally {
        conn.release();
    }
}

async function addChatMessage(conversationId, role, content, toolCalls = null) {
    if (!conversationId) return false;
    
    const conn = await getConnection();
    if (!conn) return false;
    
    try {
        const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;
        await conn.execute(`
            INSERT INTO chat_messages (conversation_id, role, content, tool_calls)
            VALUES (?, ?, ?, ?)
        `, [conversationId, role, content, toolCallsJson]);
        return true;
    } catch (e) {
        // Fallback si la sesión aún no existe en chat_sessions
        if (e.message.includes('foreign key constraint')) {
            await getOrCreateChatSession(conversationId);
            try {
                await conn.execute(`
                    INSERT INTO chat_messages (conversation_id, role, content, tool_calls)
                    VALUES (?, ?, ?, ?)
                `, [conversationId, role, content, toolCallsJson]);
                return true;
            } catch (e2) {
                return false;
            }
        }
        return false;
    } finally {
        conn.release();
    }
}

async function addObservabilityLog(sessionId, userPrompt, systemResponse, ttftMs, totalLatencyMs, tokensPerSecond, wasBlocked, toolsExecuted) {
    const conn = await getConnection();
    if (!conn) return false;
    
    try {
        const toolsJson = toolsExecuted ? JSON.stringify(toolsExecuted) : null;
        await conn.execute(`
            INSERT INTO observability_logs
              (session_id, user_prompt, system_response, ttft_ms,
               total_latency_ms, tokens_per_second, was_blocked, tools_executed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [sessionId, userPrompt, systemResponse, ttftMs, totalLatencyMs, tokensPerSecond, wasBlocked ? 1 : 0, toolsJson]);
        return true;
    } catch (e) {
        console.error(`[db-config] Error en addObservabilityLog: ${e.message}`);
        return false;
    } finally {
        conn.release();
    }
}

async function getBakerProfileByUserId(userId) {
    const conn = await getConnection();
    if (!conn) return null;
    
    try {
        const [rows] = await conn.execute(
            'SELECT * FROM baker_profiles WHERE user_id = ?',
            [userId]
        );
        return rows[0] || null;
    } catch (e) {
        console.error(`[db-config] Error en getBakerProfileByUserId: ${e.message}`);
        return null;
    } finally {
        conn.release();
    }
}

async function getBakerCakes(bakerId) {
    const conn = await getConnection();
    if (!conn) return [];
    
    try {
        const [rows] = await conn.execute(`
            SELECT c.*, cat.name as category_name
            FROM cakes c
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE c.baker_id = ?
            ORDER BY c.created_at DESC
        `, [bakerId]);
        return rows;
    } catch (e) {
        console.error(`[db-config] Error en getBakerCakes: ${e.message}`);
        return [];
    } finally {
        conn.release();
    }
}

async function addBakerCake(bakerId, categoryId, name, description, price, imageUrl = null, isFeatured = 0) {
    const conn = await getConnection();
    if (!conn) return false;
    
    try {
        const [result] = await conn.execute(`
            INSERT INTO cakes (baker_id, category_id, name, description, price, image_url, is_featured)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [bakerId, categoryId, name, description, price, imageUrl, isFeatured]);
        return result.insertId;
    } catch (e) {
        console.error(`[db-config] Error en addBakerCake: ${e.message}`);
        return false;
    } finally {
        conn.release();
    }
}

async function updateBakerCake(bakerId, cakeId, name, description, price, categoryId, isFeatured = 0) {
    const conn = await getConnection();
    if (!conn) return false;
    
    try {
        const [result] = await conn.execute(`
            UPDATE cakes 
            SET name = ?, description = ?, price = ?, category_id = ?, is_featured = ? 
            WHERE id = ? AND baker_id = ?
        `, [name, description, price, categoryId, isFeatured, cakeId, bakerId]);
        return result.affectedRows > 0;
    } catch (e) {
        console.error(`[db-config] Error en updateBakerCake: ${e.message}`);
        return false;
    } finally {
        conn.release();
    }
}

async function deleteBakerCake(bakerId, cakeId) {
    const conn = await getConnection();
    if (!conn) return false;
    
    try {
        const [result] = await conn.execute(
            'DELETE FROM cakes WHERE id = ? AND baker_id = ?',
            [cakeId, bakerId]
        );
        return result.affectedRows > 0;
    } catch (e) {
        console.error(`[db-config] Error en deleteBakerCake: ${e.message}`);
        return false;
    } finally {
        conn.release();
    }
}

async function getClientAppointments(clientId) {
    const conn = await getConnection();
    if (!conn) return [];
    
    try {
        const [rows] = await conn.execute(`
            SELECT a.id, a.date, a.time_slot, a.notes, a.status, b.business_name as baker_business_name
            FROM appointments a
            JOIN baker_profiles b ON a.baker_id = b.id
            WHERE a.client_id = ?
            ORDER BY a.date ASC, a.time_slot ASC
        `, [clientId]);
        return rows;
    } catch (e) {
        console.error(`[db-config] Error en getClientAppointments: ${e.message}`);
        return [];
    } finally {
        conn.release();
    }
}

async function getBakerAppointments(bakerUserId) {
    const conn = await getConnection();
    if (!conn) return [];
    
    try {
        const [rows] = await conn.execute(`
            SELECT a.id, a.date, a.time_slot, a.notes, a.status, u.name as client_name
            FROM appointments a
            JOIN users u ON a.client_id = u.id
            JOIN baker_profiles b ON a.baker_id = b.id
            WHERE b.user_id = ?
            ORDER BY a.date ASC, a.time_slot ASC
        `, [bakerUserId]);
        return rows;
    } catch (e) {
        console.error(`[db-config] Error en getBakerAppointments: ${e.message}`);
        return [];
    } finally {
        conn.release();
    }
}

async function getClientDesigns(clientId) {
    const conn = await getConnection();
    if (!conn) return [];
    
    try {
        const [rows] = await conn.execute(`
            SELECT id, sponge, filling, decoration, size, notes, status, created_at
            FROM cake_designs
            WHERE client_id = ?
            ORDER BY created_at DESC
        `, [clientId]);
        return rows;
    } catch (e) {
        console.error(`[db-config] Error en getClientDesigns: ${e.message}`);
        return [];
    } finally {
        conn.release();
    }
}

async function deleteChatConversation(conversationId = null, clientId = null) {
    const conn = await getConnection();
    if (!conn) return false;
    
    try {
        if (conversationId) {
            await conn.execute('DELETE FROM chat_messages WHERE conversation_id = ?', [conversationId]);
            await conn.execute('DELETE FROM chat_sessions WHERE conversation_id = ?', [conversationId]);
        } else if (clientId) {
            await conn.execute('DELETE FROM chat_messages WHERE conversation_id IN (SELECT conversation_id FROM chat_sessions WHERE client_id = ?)', [clientId]);
            await conn.execute('DELETE FROM chat_sessions WHERE client_id = ?', [clientId]);
        }
        return true;
    } catch (e) {
        console.error(`[db-config] Error en deleteChatConversation: ${e.message}`);
        return false;
    } finally {
        conn.release();
    }
}

module.exports = {
    getCakes,
    getBakers,
    getBakerById,
    getAppointmentsByBakerDate,
    insertAppointment,
    insertGuestAppointment,
    getCategories,
    getUserById,
    getOrCreateChatSession,
    getChatHistory,
    getLastConversationByClient,
    getChatMessages,
    addChatMessage,
    addObservabilityLog,
    getBakerProfileByUserId,
    getBakerCakes,
    addBakerCake,
    updateBakerCake,
    deleteBakerCake,
    getClientAppointments,
    getBakerAppointments,
    getClientDesigns,
    deleteChatConversation
};
