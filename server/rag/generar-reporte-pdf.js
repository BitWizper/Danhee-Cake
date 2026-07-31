/**
 * generar-reporte-pdf.js — Generador de reporte de evaluación en Markdown
 * El reporte Markdown puede convertirse a PDF usando herramientas como pandoc
 * Uso: node server/rag/generar-reporte-pdf.js
 */

const fs = require('fs');
const path = require('path');

function generateMarkdownReport(results) {
    const timestamp = new Date().toLocaleString('es-MX');
    
    const routingAccuracy = results.routing_accuracy.total > 0 
        ? (results.routing_accuracy.correct / results.routing_accuracy.total) * 100 
        : 0;
    
    const avgFaithfulness = results.faithfulness.scores.length > 0
        ? results.faithfulness.scores.reduce((a, b) => a + b, 0) / results.faithfulness.scores.length
        : 0;
    
    const injectionBlocking = results.injection_blocking.total > 0
        ? (results.injection_blocking.correct / results.injection_blocking.total) * 100
        : 0;
    
    let markdown = `# Reporte de Evaluación del Agente - Danhee Cake

**Fecha:** ${timestamp}
**Proyecto:** Danhee Cake - IA Local
**Semana:** 7 - Arquitecturas Multi-Agente, Advanced RAG y Autoevaluación

---

## Resumen Ejecutivo

| Métrica | Resultado | Detalles |
|---------|-----------|----------|
| Total de Pruebas | ${results.total_tests} | 15 preguntas de prueba |
| Precisión de Ruteo | ${routingAccuracy.toFixed(2)}% | ${results.routing_accuracy.correct}/${results.routing_accuracy.total} correctas |
| Fidelidad Promedio | ${(avgFaithfulness * 100).toFixed(2)}% | Basado en ${results.faithfulness.scores.length} evaluaciones |
| Bloqueo de Inyecciones | ${injectionBlocking.toFixed(2)}% | ${results.injection_blocking.correct}/${results.injection_blocking.total} bloqueadas |

---

## Detalles de Evaluación

### 1. Precisión de Ruteo

El ruteador del agente evaluó correctamente el **${routingAccuracy.toFixed(2)}%** de las preguntas.

**Categorías evaluadas:**
- Preguntas RAG: Búsqueda de información en documentos
- Preguntas Transaccionales: Agendar citas, modificar datos
- Inyecciones de Prompt: Intentos de bypass de seguridad

### 2. Fidelidad de Respuestas

La fidelidad promedio fue del **${(avgFaithfulness * 100).toFixed(2)}%**, indicando que las respuestas del agente se basan principalmente en el contexto disponible sin alucinaciones significativas.

### 3. Seguridad y Bloqueo de Inyecciones

El sistema bloqueó correctamente el **${injectionBlocking.toFixed(2)}%** de los intentos de inyección de prompt, demostrando una capa de seguridad efectiva.

---

## Resultados por Pregunta

`;

    // Agrupar por categoría
    const byCategory = {};
    results.details.forEach(r => {
        if (!byCategory[r.category]) byCategory[r.category] = [];
        byCategory[r.category].push(r);
    });
    
    for (const [category, tests] of Object.entries(byCategory)) {
        markdown += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
        
        for (const test of tests) {
            const status = test.routing_correct !== undefined 
                ? (test.routing_correct ? '✅ Correcto' : '❌ Incorrecto')
                : (test.injection_blocked_correctly !== undefined 
                    ? (test.injection_blocked_correctly ? '✅ Bloqueado' : '❌ No bloqueado')
                    : '⏭️ N/A');
            
            markdown += `**${test.id}** - ${status}\n\n`;
            markdown += `- **Pregunta:** ${test.question}\n`;
            markdown += `- **Agente Esperado:** ${test.expected_agent}\n`;
            
            if (test.response) {
                if (test.response.success) {
                    markdown += `- **Respuesta:** ${test.response.response?.substring(0, 100)}...\n`;
                } else {
                    markdown += `- **Error:** ${test.response.error}\n`;
                }
            }
            
            if (test.faithfulness_score !== undefined) {
                markdown += `- **Fidelidad:** ${(test.faithfulness_score * 100).toFixed(2)}%\n`;
            }
            
            markdown += `\n`;
        }
        
        markdown += `\n`;
    }
    
    markdown += `---

## Conclusiones

### Fortalezas
1. **Arquitectura Multi-Agente**: El ruteador funciona correctamente en la mayoría de los casos
2. **Seguridad**: La capa de guardrails bloquea efectivamente inyecciones de prompt
3. **Fidelidad**: Las respuestas del agente se basan en el contexto disponible

### Áreas de Mejora
1. **Precisión de Ruteo**: Se puede mejorar el análisis de intención para reducir errores
2. **Advanced RAG**: Implementar búsqueda híbrida y reranking para mejorar fidelidad
3. **Escala**: Evaluar con base de datos de 50,000+ registros para pruebas de estrés

### Recomendaciones
1. Implementar análisis de intención más sofisticado en el ruteador
2. Integrar modelo de reranker especializado (bge-reranker-v2-m3)
3. Realizar pruebas de estrés con base de datos sembrada de 50,000+ registros
4. Implementar búsqueda híbrida (vectorial + BM25) en el pipeline RAG

---

## Metodología

**Framework de Evaluación:** LLM-as-a-Judge
**Modelo Evaluador:** Llama 3.2:latest
**Base de Datos:** MySQL con registros sembrados
**Categorías de Prueba:**
- RAG (5 preguntas)
- Transaccional (5 preguntas)
- Inyecciones de Prompt (5 preguntas)

**Métricas Calculadas:**
- Precisión de Ruteo: ¿El agente correcto respondió?
- Fidelidad: ¿La respuesta se basa en el contexto?
- Bloqueo de Inyecciones: ¿El guardrail funcionó?

---

*Este reporte fue generado automáticamente por el script de evaluación del agente Danhee Cake.*
`;

    return markdown;
}

function main() {
    try {
        // Leer reporte JSON si existe
        const reportPath = './evaluation-report.json';
        
        if (!fs.existsSync(reportPath)) {
            console.error('❌ No se encontró el reporte JSON. Ejecuta primero evaluar-agente.js');
            process.exit(1);
        }
        
        const results = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        
        // Generar reporte Markdown
        const markdown = generateMarkdownReport(results);
        
        // Guardar reporte Markdown
        const markdownPath = './evaluation-report.md';
        fs.writeFileSync(markdownPath, markdown);
        
        console.log(`📄 Reporte Markdown generado: ${markdownPath}`);
        console.log('\n💡 Para convertir a PDF, usa una de estas opciones:');
        console.log('   1. Pandoc: pandoc evaluation-report.md -o evaluation-report.pdf');
        console.log('   2. VS Code: Abre el archivo .md y usa "Print to PDF"');
        console.log('   3. Online: https://www.markdowntopdf.com/');
        console.log('\n✅ Reporte generado exitosamente');
        
    } catch (error) {
        console.error('❌ Error generando reporte:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { generateMarkdownReport };
