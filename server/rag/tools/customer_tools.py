"""
customer_tools.py — Herramientas y funciones especializadas para el Agente de Clientes en Danhee Cake.
"""

import sys
import os
import datetime
import re
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(base_dir))

from db_config import (
    get_cakes, get_bakers, get_baker_by_id, 
    get_appointments_by_baker_date, insert_appointment, 
    insert_guest_appointment, get_categories, get_user_by_id,
    get_client_appointments, get_baker_appointments, get_client_designs
)

from tools.common_tools import (
    quitar_acentos, extraer_texto_pdf, _get_current_client_id
)

_last_search_result = {}
_last_context = {}

def _coincide_nombre(busqueda: str, target_name: str) -> bool:
    if not busqueda or not target_name:
        return False
    b_limpio = quitar_acentos(busqueda.lower().strip())
    t_limpio = quitar_acentos(target_name.lower().strip())
    
    if b_limpio == t_limpio:
        return True
    if b_limpio in t_limpio or t_limpio in b_limpio:
        return True
        
    palabras_ignorar = {'pastel', 'pasteles', 'del', 'de', 'el', 'la', 'un', 'una', 'con', 'para', 'sabor', 'mas', 'informacion', 'dame', 'quiero', 'saber', 'sobre', 'detalle', 'detalles'}
    tokens_b = [w for w in b_limpio.split() if w not in palabras_ignorar]
    tokens_t = [w for w in t_limpio.split() if w not in palabras_ignorar]
    
    if tokens_b and tokens_t:
        if all(w in t_limpio for w in tokens_b):
            return True
        coincidencias = sum(1 for w in tokens_b if w in tokens_t)
        if coincidencias >= max(1, len(tokens_b) * 0.5):
            return True
    return False

def _parse_fecha_relativa(texto: str, base_date: datetime.date = None) -> str:
    if not texto:
        return ""
    if base_date is None:
        base_date = datetime.date(2026, 7, 23)
        
    t = quitar_acentos(str(texto).lower().strip())
    
    match_iso = re.search(r'\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b', t)
    if match_iso:
        y, m, d = match_iso.groups()
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
        
    match_dmy = re.search(r'\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b', t)
    if match_dmy:
        d, m, y = match_dmy.groups()
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"

    meses = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
        'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
    }
    match_texto = re.search(r'\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b', t)
    if match_texto:
        d_str, m_str, y_str = match_texto.groups()
        if m_str in meses:
            y = int(y_str) if y_str else base_date.year
            return f"{y:04d}-{meses[m_str]:02d}-{int(d_str):02d}"

    if "hoy" in t:
        return base_date.strftime("%Y-%m-%d")
    if "pasado manana" in t:
        return (base_date + datetime.timedelta(days=2)).strftime("%Y-%m-%d")
    if "manana" in t:
        return (base_date + datetime.timedelta(days=1)).strftime("%Y-%m-%d")

    match_dias = re.search(r'\ben\s+(\d+)\s+dias?\b', t)
    if match_dias:
        dias = int(match_dias.group(1))
        return (base_date + datetime.timedelta(days=dias)).strftime("%Y-%m-%d")

    dias_semana = {
        'lunes': 0, 'martes': 1, 'miercoles': 2, 'jueves': 3,
        'viernes': 4, 'sabado': 5, 'domingo': 6
    }
    
    for dia_nombre, dia_num in dias_semana.items():
        if dia_nombre in t:
            dias_hasta = (dia_num - base_date.weekday()) % 7
            if dias_hasta == 0 and ("siguiente" in t or "proximo" in t or "proxima" in t):
                dias_hasta = 7
            elif "siguiente semana" in t or "proxima semana" in t:
                if dias_hasta == 0:
                    dias_hasta = 7
                else:
                    dias_hasta += 7
            
            target_date = base_date + datetime.timedelta(days=dias_hasta)
            return target_date.strftime("%Y-%m-%d")

    return ""

def _parse_hora_minutos(hora_str: str) -> tuple:
    if not hora_str:
        return None
    h_limpia = quitar_acentos(str(hora_str).lower().strip())
    
    is_pm = 'pm' in h_limpia or 'tarde' in h_limpia or 'noche' in h_limpia
    is_am = 'am' in h_limpia or 'manana' in h_limpia
    
    numbers = re.findall(r'\d+', h_limpia)
    if not numbers:
        return None
    
    h = int(numbers[0])
    m = int(numbers[1]) if len(numbers) > 1 else 0
    
    if is_pm and h < 12:
        h += 12
    elif is_am and h == 12:
        h = 0
        
    return (h, m)

def _validar_horario_repostero(hora_str: str, baker_obj: dict = None) -> tuple:
    parsed = _parse_hora_minutos(hora_str)
    if not parsed:
        return True, ""
        
    h, m = parsed
    baker_name = baker_obj.get("business_name", "la repostería") if isinstance(baker_obj, dict) else "la repostería"
    business_hours_str = baker_obj.get("business_hours", "Lunes a Viernes de 8:00 AM a 6:00 PM") if isinstance(baker_obj, dict) else "Lunes a Viernes de 8:00 AM a 6:00 PM"

    if h < 8 or h >= 19:
        return False, f"⏰ Lo siento, el horario de las **{hora_str}** está fuera de la jornada de atención de **{baker_name}**.\n\n📍 Su horario de atención es: `{business_hours_str}`.\n\n¿Te gustaría elegir un horario entre las 8:00 AM y las 6:00 PM? 😊"
        
    return True, ""

def _convert_to_mysql_time(hora_str: str) -> str:
    parsed = _parse_hora_minutos(hora_str)
    if not parsed:
        return "10:00:00"
    h, m = parsed
    return f"{h:02d}:{m:02d}:00"

def consultar_catalogo_pasteles(categoria: str = "", contexto_anterior: str = "") -> dict:
    """Consulta el catálogo de pasteles disponibles en Danhee Cake."""
    global _last_search_result, _last_context
    pasteles = get_cakes()
    print(f"[DEBUG] Total pasteles en BD: {len(pasteles)}", file=sys.stderr)
    
    if categoria and categoria.strip():
        categoria_lower = categoria.lower()
        categoria_normalizada = quitar_acentos(categoria_lower)
        
        pasteles = [
            p for p in pasteles
            if categoria_normalizada in quitar_acentos(str(p.get("category_name", "")).lower())
            or categoria_lower in str(p.get("name", "")).lower()
        ]
        print(f"[DEBUG] Pasteles filtrados por '{categoria}': {len(pasteles)}", file=sys.stderr)
    elif contexto_anterior:
        contexto_normalizado = quitar_acentos(contexto_anterior.lower())
        pasteles = [
            p for p in pasteles
            if contexto_normalizado in quitar_acentos(str(p.get("category_name", "")).lower())
            or contexto_normalizado in quitar_acentos(str(p.get("name", "")).lower())
        ]
        print(f"[DEBUG] Pasteles filtrados por contexto '{contexto_anterior}': {len(pasteles)}", file=sys.stderr)
    
    if not pasteles:
        return {"mensaje": f"No encontré pasteles en Danhee Cake para la categoría '{categoria if categoria else contexto_anterior}'."}
    
    resultado = [
        {
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
            "calificacion": p.get("rating", 0),
            "categoria": p.get("category_name", "Sin categoría"),
            "empresa": p.get("business_name", "Danhee Cake"),
            "repostero": p.get("baker_name", "No especificado"),
        }
        for p in pasteles[:20]
    ]
    
    _last_search_result = {"pasteles": resultado, "categoria": categoria if categoria else contexto_anterior}
    _last_context["ultima_categoria"] = _last_search_result["categoria"]
    
    return {"pasteles": resultado, "total": len(resultado), "categoria_filtro": categoria if categoria else contexto_anterior if contexto_anterior else "todos"}

def consultar_todos_los_pasteles(contexto_anterior: str = "") -> dict:
    """Muestra el catálogo completo de todos los pasteles disponibles en Danhee Cake."""
    pasteles = get_cakes()
    
    if not pasteles:
        return {"mensaje": "No hay pasteles registrados en Danhee Cake."}
    
    resultado = [
        {
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
            "calificacion": p.get("rating", 0),
            "categoria": p.get("category_name", "Sin categoría"),
            "descripcion": p.get("description", ""),
            "empresa": p.get("business_name", "Danhee Cake"),
            "repostero": p.get("baker_name", "No especificado"),
        }
        for p in pasteles
    ]
    return {"pasteles": resultado, "total": len(resultado), "mensaje": f"🍰 Catálogo completo de Danhee Cake: {len(resultado)} pasteles disponibles."}

def consultar_reposteros_disponibles(contexto_anterior: str = "") -> dict:
    """Lista todos los reposteros verificados de Danhee Cake."""
    reposteros = get_bakers()
    
    resultado = [
        {
            "id": r.get("id"),
            "nombre_negocio": r.get("business_name"),
            "especialidad": r.get("specialty"),
            "calificacion": float(r.get("rating_avg", 0)) if r.get("rating_avg") else 0.0,
            "ubicacion": r.get("location"),
            "verificado": bool(r.get("is_verified")),
        }
        for r in reposteros
    ]
    return {"reposteros": resultado, "total": len(resultado)}

def verificar_disponibilidad_repostero(baker_id: int, fecha: str) -> dict:
    """Verifica si un repostero de Danhee Cake tiene disponibilidad en una fecha específica."""
    citas = get_appointments_by_baker_date(baker_id, fecha)
    disponible = len(citas) < 5
    return {
        "baker_id": baker_id,
        "fecha": fecha,
        "disponible": disponible,
        "citas_agendadas": len(citas),
        "mensaje": f"El repostero #{baker_id} de Danhee Cake {'sí' if disponible else 'no'} tiene disponibilidad para {fecha}. {'' if disponible else 'Prueba otra fecha.'}"
    }

def obtener_precios_por_categoria(categoria: str = "", contexto_anterior: str = "") -> dict:
    """Obtiene el rango de precios de los pasteles de Danhee Cake por categoría."""
    todos = get_cakes()
    categoria_buscar = categoria if categoria else contexto_anterior
    
    if not categoria_buscar:
        precios = [float(p.get("price", 0)) for p in todos if p.get("price")]
        categorias = sorted({(p.get("category_name") or "General").strip() for p in todos if p.get("category_name")})
        if not precios:
            return {"mensaje": "Aún no hay precios registrados en Danhee Cake."}
        return {
            "mensaje": (
                "En Danhee Cake tenemos precios para varias categorías de pasteles. "
                f"El rango general va de ${min(precios):.2f} a ${max(precios):.2f} MXN, con un promedio de ${round(sum(precios) / len(precios), 2):.2f}. "
                "Las categorías disponibles incluyen: " + ", ".join(categorias[:8]) + ". "
                "Si quieres, dime una categoría específica para ver los precios detallados."
            ),
            "precio_min": min(precios),
            "precio_max": max(precios),
            "precio_promedio": round(sum(precios) / len(precios), 2),
            "categorias_disponibles": categorias[:20],
            "cantidad_pasteles": len(todos)
        }
    
    filtrados = [
        p for p in todos
        if categoria_buscar.lower() in str(p.get("category_name", "")).lower()
        or categoria_buscar.lower() in str(p.get("name", "")).lower()
    ]
    
    if not filtrados:
        return {"mensaje": f"No encontré pasteles en Danhee Cake para '{categoria_buscar}'. Los pasteles disponibles son: " + ", ".join([p.get("name") for p in todos[:5]])}
    
    precios = [float(p.get("price", 0)) for p in filtrados if p.get("price")]
    if not precios:
        return {"mensaje": f"No hay precios registrados en Danhee Cake para '{categoria_buscar}'."}
    
    lista_pasteles = "\n".join([f"• {p.get('name')} - ${float(p.get('price', 0))} MXN" for p in filtrados[:4]])
    
    nota_mas = ""
    if len(filtrados) > 4:
        nota_mas = f"\n\n*Mostrando 4 de {len(filtrados)} pasteles. Pregúntame si quieres ver más.*"
        
    return {
        "categoria": categoria_buscar,
        "precio_min": min(precios),
        "precio_max": max(precios),
        "precio_promedio": round(sum(precios) / len(precios), 2),
        "cantidad_pasteles": len(filtrados),
        "pasteles": [{"nombre": p.get("name"), "precio": float(p.get("price", 0))} for p in filtrados[:4]],
        "mensaje": f"🍰 Pasteles en la categoría '{categoria_buscar}':\n{lista_pasteles}{nota_mas}\n\n💰 Rango de precios: ${min(precios)} - ${max(precios)} MXN"
    }

def registrar_solicitud_cita(client_name: str = "", baker_id: int = None, fecha: str = "", hora: str = "", notas: str = "") -> dict:
    """Registra una solicitud de cita con un repostero de Danhee Cake."""
    fecha_convertida = _parse_fecha_relativa(fecha)
    if not fecha_convertida:
        return {
            "exito": False,
            "necesita_datos": True,
            "mensaje": "📅 Con gusto te ayudo a agendar tu cita. Por favor indícame la **fecha** deseada (por ejemplo: *el próximo viernes*, *en 15 días*, o *2026-07-30*) y la **hora** que prefieres."
        }

    baker_obj = None
    if not baker_id:
        bakers = get_bakers()
        if bakers:
            baker_obj = bakers[0]
            baker_id = baker_obj.get("id", 1)
        else:
            baker_id = 1
    else:
        try: baker_id = int(baker_id)
        except: baker_id = 1
        baker_obj = get_baker_by_id(baker_id)

    es_horario_valido, msg_error_horario = _validar_horario_repostero(hora, baker_obj)
    if not es_horario_valido:
        return {
            "exito": False,
            "necesita_datos": True,
            "mensaje": msg_error_horario
        }

    hora_limpia = str(hora).strip() if hora else "10:00 AM"
    baker_name = baker_obj.get("business_name") if isinstance(baker_obj, dict) and baker_obj.get("business_name") else f"Repostero #{baker_id}"
    
    if not client_name or "CLIENTE" in str(client_name).upper() or "[" in str(client_name):
        client_name = "Cliente"

    notas_final = f"Cliente: {client_name}. {notas}".strip()
    client_id = _get_current_client_id()
    time_slot_mysql = _convert_to_mysql_time(hora_limpia)

    if client_id:
        exito = insert_appointment(client_id, baker_id, fecha_convertida, time_slot_mysql, notas_final)
        if exito:
            return {
                "exito": True,
                "mensaje": f"✅ ¡Cita registrada exitosamente! Estimado/a **{client_name}**, tu cita de degustación con **{baker_name}** ha sido agendada para el **{fecha_convertida}** a las **{hora_limpia}**.\n\n📱 Podrás revisar y gestionar tu cita en cualquier momento desde la sección **'Mis Citas'** en tu cuenta. 🎂✨"
            }
    else:
        exito = insert_guest_appointment(baker_id, fecha_convertida, time_slot_mysql, notas_final)
        if exito:
            return {
                "exito": True,
                "mensaje": f"✅ ¡Solicitud de cita recibida! Tu cita con **{baker_name}** para el **{fecha_convertida}** a las **{hora_limpia}** fue agendada correctamente. 🎂"
            }

    return {
        "exito": False,
        "mensaje": f"📋 Hubo un problema al registrar la cita en Danhee Cake. Por favor intenta más tarde."
    }

def consultar_categorias(contexto_anterior: str = "") -> dict:
    """Lista todas las categorías de pasteles disponibles en Danhee Cake."""
    cats = get_categories()
    if not cats:
        categorias_info = [
            {"nombre": "XV Años", "icono": "👑", "descripcion": "Pasteles elegantes para XV años"},
            {"nombre": "Boda", "icono": "💍", "descripcion": "Pasteles nupciales de lujo"},
            {"nombre": "Baby Shower", "icono": "🍼", "descripcion": "Diseños tiernos para baby shower"},
            {"nombre": "Cumpleaños", "icono": "🎂", "descripcion": "Pasteles personalizados para cumpleaños"},
            {"nombre": "Aniversario", "icono": "💑", "descripcion": "Pasteles románticos para aniversarios"},
            {"nombre": "Graduación", "icono": "🎓", "descripcion": "Celebra tu graduación con estilo"},
        ]
        if contexto_anterior:
            contexto_norm = quitar_acentos(contexto_anterior.lower())
            categorias_filtradas = [
                c for c in categorias_info 
                if contexto_norm in quitar_acentos(c["nombre"].lower())
            ]
            if categorias_filtradas:
                return {"categorias": categorias_filtradas}
        return {"categorias": categorias_info}
    return {"categorias": [{"nombre": c.get("name"), "icono": c.get("icon")} for c in cats]}

def buscar_pastel_por_nombre(nombre: str, contexto_anterior: str = "") -> dict:
    """Busca pasteles en el catálogo de Danhee Cake por nombre parcial."""
    global _last_context
    todos = get_cakes()
    nombre_limpio = quitar_acentos(nombre.lower())
    encontrados = []
    
    for p in todos:
        nombre_pastel = quitar_acentos(str(p.get("name", "")).lower())
        if nombre_limpio in nombre_pastel:
            encontrados.append(p)
            
    if not encontrados and contexto_anterior:
        contexto_limpio = quitar_acentos(contexto_anterior.lower())
        for p in todos:
            nombre_pastel = quitar_acentos(str(p.get("name", "")).lower())
            if contexto_limpio in nombre_pastel and nombre_limpio in nombre_pastel:
                encontrados.append(p)
                
    if not encontrados:
        return {"mensaje": f"No encontré pasteles en Danhee Cake con el nombre que contiene '{nombre}'."}
        
    resultado = []
    for p in encontrados[:10]:
        resultado.append({
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
            "categoria": p.get("category_name", "Sin categoría"),
            "empresa": p.get("business_name", "Danhee Cake"),
            "calificacion": p.get("rating", 0),
        })
        
    _last_context["ultimos_pasteles"] = resultado
    _last_context["ultima_busqueda_nombre"] = nombre
    
    lista = "\n".join([
        f"• **{r['nombre']}** - ${r['precio']:.2f} MXN\n  🏢 Empresa: {r['empresa']}\n  📂 Categoría: {r['categoria']}\n  ⭐ Calificación: {r['calificacion']}"
        for r in resultado
    ])
    return {
        "encontrados": resultado,
        "cantidad": len(resultado),
        "mensaje": f"🍰 Encontré {len(resultado)} pasteles que coinciden con '{nombre}':\n\n{lista}"
    }

def obtener_info_repostero(baker_id: int) -> dict:
    """Obtiene información completa de un repostero de Danhee Cake."""
    repostero = get_baker_by_id(baker_id)
    if not repostero:
        return {"error": f"No se encontró el repostero de Danhee Cake con ID {baker_id}."}
    
    todos_pasteles = get_cakes()
    pasteles_repostero = [
        {
            "nombre": p.get("name"),
            "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
            "categoria": p.get("category_name", "Sin categoría")
        }
        for p in todos_pasteles if p.get("baker_id") == baker_id
    ]
    
    return {
        "id": repostero.get("id"),
        "nombre_negocio": repostero.get("business_name"),
        "especialidad": repostero.get("specialty"),
        "bio": repostero.get("bio"),
        "calificacion": float(repostero.get("rating_avg", 0)) if repostero.get("rating_avg") else 0.0,
        "ubicacion": repostero.get("location"),
        "verificado": bool(repostero.get("is_verified")),
        "pasteles": pasteles_repostero,
        "total_pasteles": len(pasteles_repostero)
    }

def calcular_precio_personalizado(tamanio: str, relleno: str, decoracion: str) -> dict:
    """Calcula el precio estimado de un pastel personalizado en Danhee Cake."""
    precios_base = {"pequeño": 350, "mediano": 550, "grande": 850}
    extra_relleno = {"vainilla": 0, "chocolate": 50, "fresas": 80, "dulce de leche": 70}
    extra_decoracion = {"fondant": 150, "buttercream": 80, "flores": 120, "minimalista": 50}
    
    base = precios_base.get(tamanio.lower(), 550)
    extra_r = extra_relleno.get(relleno.lower(), 60)
    extra_d = extra_decoracion.get(decoracion.lower(), 100)
    
    return {
        "tamanio": tamanio,
        "relleno": relleno,
        "decoracion": decoracion,
        "precio_estimado": base + extra_r + extra_d,
        "moneda": "MXN",
        "nota": "Precio estimado en Danhee Cake. El final puede variar según complejidad."
    }

def consultar_politicas_pasteleria(tema: str) -> dict:
    """Proporciona las políticas oficiales de Danhee Cake."""
    tema_key = tema.lower().strip()
    if tema_key == "danhee":
        resultado_pdf = extraer_texto_pdf("danhee_knowledge_base.pdf")
        if "mensaje" in resultado_pdf:
            return {"tema": "Información de Danhee Cake", "info": resultado_pdf["mensaje"]}
        else:
            return {"tema": "Información de Danhee Cake", "info": "🎂 Danhee Cake es una plataforma web especializada en repostería personalizada que conecta clientes con reposteros profesionales."}
    
    politicas = {
        "entrega": {
            "tema": "Política de Entrega - Danhee Cake",
            "info": "📦 En Danhee Cake: Pedidos estándar requieren 5 días de anticipación. Pasteles de boda o XV Años: mínimo 15 días de anticipación. Entrega a domicilio disponible."
        },
        "pago": {
            "tema": "Métodos de Pago - Danhee Cake",
            "info": "💳 En Danhee Cake aceptamos: Transferencia bancaria, tarjeta de débito/crédito y efectivo. Se requiere anticipo del 50% para confirmar el pedido."
        },
        "cancelacion": {
            "tema": "Política de Cancelación - Danhee Cake",
            "info": "❌ En Danhee Cake: Cancelaciones con más de 7 días: reembolso del 80%. Entre 3-7 días: reembolso del 50%. Menos de 72 horas: sin reembolso."
        },
        "personalizacion": {
            "tema": "Personalización - Danhee Cake",
            "info": "🎨 En Danhee Cake cada pastel es 100% personalizable: puedes elegir sabor, relleno, tamaño, decoración y temática."
        },
        "general": {
            "tema": "Información General - Danhee Cake",
            "info": "🎂 Danhee Cake es una plataforma web especializada en repostería personalizada que conecta clientes con reposteros profesionales."
        }
    }
    return politicas.get(tema_key, politicas["general"])

def recomendar_pastel(ocasion: str, presupuesto: str = "", estilo: str = "", contexto_anterior: str = "") -> dict:
    """Recomienda pasteles de Danhee Cake según ocasión, presupuesto y estilo."""
    todos_pasteles = get_cakes()
    ocasion_buscar = ocasion if ocasion else contexto_anterior
    
    if not ocasion_buscar:
        return {"mensaje": "Por favor especifica qué tipo de pastel te gustaría que te recomiende (cumpleaños, boda, etc.)"}
    
    ocasion_lower = ocasion_buscar.lower()
    ocasion_normalizada = quitar_acentos(ocasion_lower)
    
    pasteles_filtrados = [
        p for p in todos_pasteles
        if ocasion_normalizada in quitar_acentos(str(p.get("category_name", "")).lower())
        or ocasion_lower in str(p.get("name", "")).lower()
    ]
    
    if presupuesto and pasteles_filtrados:
        if "bajo" in presupuesto.lower():
            pasteles_filtrados = [p for p in pasteles_filtrados if float(p.get("price", 0)) < 500]
        elif "medio" in presupuesto.lower():
            pasteles_filtrados = [p for p in pasteles_filtrados if 500 <= float(p.get("price", 0)) <= 800]
        elif "alto" in presupuesto.lower():
            pasteles_filtrados = [p for p in pasteles_filtrados if float(p.get("price", 0)) > 800]
    
    if pasteles_filtrados:
        recomendaciones_reales = [
            {
                "nombre": p.get("name"),
                "precio": float(p.get("price", 0)),
                "empresa": p.get("business_name", "Danhee Cake"),
                "repostero": p.get("baker_name", "No especificado"),
                "categoria": p.get("category_name")
            }
            for p in pasteles_filtrados[:5]
        ]
        lista = "\n".join([f"• {r['nombre']} - ${r['precio']} MXN (Empresa: {r['empresa']})" for r in recomendaciones_reales])
        return {
            "recomendacion": f"🎂 Para {ocasion_buscar}, te recomiendo estos pasteles de Danhee Cake:\n{lista}\n\n¿Te gustaría saber más detalles de alguno?",
            "pasteles": recomendaciones_reales,
            "plataforma": "Danhee Cake"
        }
    
    if todos_pasteles:
        pasteles_disponibles = "\n".join([f"• {p.get('name')} - ${p.get('price')} MXN" for p in todos_pasteles[:5]])
        return {
            "recomendacion": f"No encontré pasteles específicos para '{ocasion_buscar}', pero estos son algunos pasteles disponibles en Danhee Cake:\n{pasteles_disponibles}\n\n¿Te gustaría que te muestre más opciones?",
            "plataforma": "Danhee Cake"
        }
    
    return {
        "recomendacion": f"En Danhee Cake tenemos pasteles para todas las ocasiones. Para {ocasion_buscar}, podemos ayudarte a diseñar un pastel personalizado.",
        "plataforma": "Danhee Cake"
    }

def consultar_origen_pastel(nombre_pastel: str, contexto_anterior: str = "") -> dict:
    """Obtiene a qué empresa, repostero, categoría y precio pertenece un pastel en Danhee Cake."""
    todos = get_cakes()
    nombre_buscar = nombre_pastel if nombre_pastel else contexto_anterior
    
    if not nombre_buscar:
        return {"mensaje": "Por favor especifica el nombre del pastel o la pastelería que quieres consultar."}
    
    nombre_limpio = quitar_acentos(nombre_buscar).lower()
    encontrados = [
        p for p in todos
        if nombre_limpio in quitar_acentos(str(p.get("name", ""))).lower()
    ]
    
    if not encontrados:
        encontrados = [
            p for p in todos
            if p.get("business_name") and (
                (nombre_limpio in quitar_acentos(str(p.get("business_name"))).lower()) or 
                (quitar_acentos(str(p.get("business_name"))).lower() in nombre_limpio)
            )
        ]
    
    if not encontrados:
        return {"mensaje": f"No encontré ningún pastel o pastelería llamada '{nombre_buscar}' en Danhee Cake."}
    
    if len(encontrados) > 1:
        resultados = []
        for p in encontrados[:5]:
            business_name = p.get("business_name", "Empresa no especificada")
            precio = float(p.get("price", 0)) if p.get("price") else 0.0
            resultados.append(f"• {p.get('name')} - ${precio} MXN (Empresa: {business_name})")
        return {
            "mensaje": f"Encontré varios resultados para '{nombre_buscar}':\n" + "\n".join(resultados),
            "resultados": encontrados[:5]
        }
    
    pastel = encontrados[0]
    baker_id = pastel.get("baker_id")
    business_name = pastel.get("business_name", "Empresa no especificada")
    category_name = pastel.get("category_name", "Categoría no especificada")
    precio = float(pastel.get("price", 0)) if pastel.get("price") else 0.0

    baker_name = "Repostero no especificado"
    repostero_info = {}
    if baker_id:
        repostero = get_baker_by_id(baker_id)
        if repostero:
            baker_name = repostero.get("name", baker_name)
            repostero_info = {
                "nombre": repostero.get("name"),
                "ubicacion": repostero.get("location"),
                "especialidad": repostero.get("specialty")
            }
    
    mensaje = f"🍰 El pastel '{pastel.get('name')}':\n📋 Categoría: {category_name}\n💰 Precio: ${precio} MXN\n🏢 Empresa: {business_name}\n👨‍🍳 Repostero: {baker_name}"
    return {
        "pastel": pastel.get("name"),
        "empresa": business_name,
        "repostero": baker_name,
        "categoria": category_name,
        "precio": precio,
        "mensaje": mensaje
    }

def buscar_pasteles_por_rango_precio(precio: float, condicion: str, contexto_anterior: str = "") -> dict:
    """Busca pasteles que tengan un precio menor o mayor al indicado."""
    todos = get_cakes()
    try:
        precio_limite = float(precio)
    except (ValueError, TypeError):
        return {"mensaje": "El precio debe ser un número válido."}
        
    condicion = condicion.lower().strip()
    if any(c in condicion for c in ["menor", "menos", "abajo", "debajo", "inferior", "<"]):
        filtrados = [p for p in todos if p.get("price") is not None and float(p.get("price")) < precio_limite]
        mensaje_condicion = f"menor a ${precio_limite}"
        orden_ascendente = True
    elif any(c in condicion for c in ["mayor", "mas", "arriba", "superior", "encima", ">"]):
        filtrados = [p for p in todos if p.get("price") is not None and float(p.get("price")) > precio_limite]
        mensaje_condicion = f"mayor a ${precio_limite}"
        orden_ascendente = False
    else:
        return {"mensaje": "La condición debe ser 'menor' o 'mayor'."}
        
    if not filtrados:
        return {"mensaje": f"No encontré pasteles con un precio {mensaje_condicion} en Danhee Cake."}
    
    filtrados.sort(key=lambda x: float(x.get("price")), reverse=not orden_ascendente)
    pasteles_mostrados = [
        {
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": float(p.get("price")),
            "empresa": p.get("business_name", "Danhee Cake"),
        }
        for p in filtrados[:15]
    ]
    lista = "\n".join([f"• {p['nombre']} - ${p['precio']} MXN (Empresa: {p['empresa']})" for p in pasteles_mostrados[:10]])
    return {
        "condicion": condicion,
        "precio_limite": precio_limite,
        "encontrados": pasteles_mostrados,
        "cantidad": len(filtrados),
        "mensaje": f"Encontré {len(filtrados)} pasteles con precio {mensaje_condicion} en Danhee Cake:\n{lista}"
    }

def consultar_pasteles_por_categoria(categoria: str = "", contexto_anterior: str = "") -> dict:
    """Consulta qué pasteles están disponibles para una categoría específica."""
    global _last_search_result, _last_context
    todos = get_cakes()
    categoria_buscar = categoria if categoria else contexto_anterior
    
    if not categoria_buscar:
        return {"mensaje": "Por favor especifica qué categoría de pasteles quieres ver.", "encontrados": [], "cantidad": 0}
    
    categoria_normalizada = quitar_acentos(categoria_buscar.lower().strip())
    filtrados = [
        p for p in todos
        if categoria_normalizada in quitar_acentos(str(p.get("category_name", "")).lower())
    ]
    
    if not filtrados:
        return {"mensaje": f"No encontré pasteles en Danhee Cake para '{categoria_buscar}'.", "encontrados": [], "cantidad": 0}
    
    resultado = [
        {
            "id": p.get("id"),
            "nombre": p.get("name"),
            "precio": float(p.get("price", 0)) if p.get("price") else 0.0,
            "empresa": p.get("business_name", "Danhee Cake"),
            "repostero": p.get("baker_name", "No especificado"),
            "categoria": p.get("category_name", "Sin categoría"),
        }
        for p in filtrados[:15]
    ]
    
    _last_search_result = {"encontrados": resultado, "categoria": categoria_buscar}
    _last_context["ultima_categoria"] = categoria_buscar
    lista = "\n".join([f"• **{p['nombre']}** - ${p['precio']} MXN (Empresa: {p['empresa']})" for p in resultado[:10]])
    return {
        "categoria": categoria_buscar,
        "encontrados": resultado,
        "cantidad": len(filtrados),
        "mensaje": f"🍰 Para {categoria_buscar}, tenemos {len(filtrados)} pasteles disponibles en Danhee Cake:\n\n{lista}"
    }

def consultar_tamanos_pasteles(contexto_anterior: str = "") -> dict:
    """Consulta los tamaños disponibles de pasteles en Danhee Cake."""
    res_pdf = extraer_texto_pdf("cake_sizes.pdf")
    if "contenido" in res_pdf or "mensaje" in res_pdf:
        msg = res_pdf.get("mensaje") or res_pdf.get("contenido")
        return {"mensaje": f"📏 Información de tamaños de pasteles:\n\n{msg[:2000]}", "fuente": "cake_sizes.pdf"}
    
    return {
        "mensaje": "📏 En Danhee Cake ofrecemos pasteles en los siguientes tamaños:\n\n• Pequeño: 6-8 personas (desde $350 MXN)\n• Mediano: 10-15 personas (desde $550 MXN)\n• Grande: 20-30 personas (desde $850 MXN)"
    }

def recomendar_por_tamanio(tamanio_deseado: str) -> dict:
    """Recomienda pasteles según el tamaño deseado (pequeño, mediano, grande)."""
    todos = get_cakes()
    tamanio_lower = tamanio_deseado.lower()
    rangos_tamanios = {"pequeño": (0, 450), "mediano": (451, 700), "grande": (701, 10000)}
    rango = rangos_tamanios.get(tamanio_lower, (0, 10000))
    
    filtrados = [p for p in todos if p.get("price") and rango[0] <= float(p.get("price")) <= rango[1]]
    if not filtrados:
        return {"mensaje": f"No encontré pasteles de tamaño {tamanio_deseado} en Danhee Cake actualmente."}
    
    resultado = [
        {"nombre": p.get("name"), "precio": float(p.get("price")), "empresa": p.get("business_name", "Danhee Cake")}
        for p in filtrados[:10]
    ]
    lista = "\n".join([f"• {r['nombre']} - ${r['precio']} MXN (Empresa: {r['empresa']})" for r in resultado])
    return {"tamanio": tamanio_deseado, "recomendaciones": resultado, "mensaje": f"🎂 Para un pastel {tamanio_deseado}:\n{lista}"}

def consultar_detalle_pastel_por_id(pastel_id: int = None, nombre_pastel: str = None, contexto_anterior: str = "") -> dict:
    """Consulta el detalle completo de un pastel específico por su ID o nombre."""
    todos = get_cakes()
    pastel_encontrado = None

    if contexto_anterior and contexto_anterior.lower() in ('<nil>', 'null', 'none'):
        contexto_anterior = ""

    if pastel_id is None or (isinstance(pastel_id, str) and not pastel_id.isdigit()):
        nombre_buscar = nombre_pastel if nombre_pastel else (pastel_id if isinstance(pastel_id, str) and pastel_id.strip() else contexto_anterior)
        if not nombre_buscar:
            return {"mensaje": "No especificaste qué pastel deseas consultar."}
        
        for p in todos:
            if _coincide_nombre(nombre_buscar, p.get("name", "")):
                pastel_encontrado = p
                break
        
        if not pastel_encontrado:
            return {"mensaje": f"No encontré un pastel con el nombre '{nombre_buscar}' en Danhee Cake."}
    else:
        try: pid = int(pastel_id)
        except: return {"mensaje": "El identificador del pastel debe ser un número."}
        for p in todos:
            if p.get("id") == pid:
                pastel_encontrado = p
                break
        if not pastel_encontrado:
            return {"mensaje": f"No encontré el pastel con ID {pid} en Danhee Cake."}

    baker_id = pastel_encontrado.get("baker_id")
    business_name = pastel_encontrado.get("business_name", "Danhee Cake")
    nombre_pastel = pastel_encontrado.get("name")
    precio = float(pastel_encontrado.get("price", 0)) if pastel_encontrado.get("price") else 0.0
    rating = pastel_encontrado.get("rating", 0.0)
    reseñas = pastel_encontrado.get("review_count", 0) or 0

    ubicacion = "No especificada"
    if baker_id:
        repostero = get_baker_by_id(baker_id)
        if repostero:
            ubicacion = repostero.get("location", "No especificada")

    estrellas = "★" * int(rating) + "☆" * (5 - int(rating)) if rating else "☆☆☆☆☆"
    mensaje = (
        f"🍰 **{nombre_pastel}**\n🏢 Empresa: {business_name}\n💰 Precio: ${precio:.2f} MXN\n📍 Ubicación: {ubicacion}\n⭐ Calificación: {estrellas} {rating:.1f} ({reseñas} reseñas)\n"
    )
    return {"pastel": nombre_pastel, "empresa": business_name, "precio": precio, "ubicacion": ubicacion, "calificacion": rating, "mensaje": mensaje}

def mostrar_opciones(contexto: str = "", contexto_anterior: str = "") -> dict:
    """Muestra las opciones de pasteles disponibles según el contexto de la conversación."""
    global _last_search_result
    contexto_buscar = contexto if contexto else contexto_anterior
    
    if _last_search_result and _last_search_result.get("encontrados"):
        lista = "\n".join([f"• **{p['nombre']}** - ${p['precio']} MXN (Empresa: {p['empresa']})" for p in _last_search_result["encontrados"][:10]])
        return {
            "mensaje": f"Aquí están las opciones que tenemos disponibles:\n\n{lista}",
            "opciones": _last_search_result["encontrados"]
        }
    if contexto_buscar:
        return consultar_pasteles_por_categoria(categoria=contexto_buscar)
    categorias = consultar_categorias()
    lista_cats = "\n".join([f"• {c['nombre']} {c.get('icono', '')}" for c in categorias.get("categorias", [])])
    return {"mensaje": f"Estas son las categorías disponibles en Danhee Cake:\n{lista_cats}"}

def consultar_empresas_por_ubicacion(ubicacion: str, contexto_anterior: str = "") -> dict:
    """Consulta qué empresas están ubicadas en una ciudad o región específica."""
    global _last_context
    reposteros = get_bakers()
    ubicacion_buscar = ubicacion if ubicacion else contexto_anterior
    if not ubicacion_buscar:
        return {"mensaje": "Por favor especifica una ubicación para buscar empresas."}
    
    ubicacion_normalizada = quitar_acentos(ubicacion_buscar.lower())
    filtrados = [r for r in reposteros if r.get("location") and (ubicacion_normalizada in quitar_acentos(r.get("location").lower()))]
    if not filtrados:
        return {"mensaje": f"No encontré empresas en '{ubicacion_buscar}' en Danhee Cake."}
    
    resultado = [{"nombre_negocio": r.get("business_name"), "especialidad": r.get("specialty"), "ubicacion": r.get("location")} for r in filtrados]
    _last_context["ultimas_empresas"] = resultado
    lista = "\n".join([f"• **{emp['nombre_negocio']}** - {emp['ubicacion']}" for emp in resultado])
    return {"ubicacion": ubicacion_buscar, "empresas": resultado, "mensaje": f"🏢 Empresas en {ubicacion_buscar}:\n{lista}"}

def consultar_pasteles_por_empresa(empresa: str, contexto_anterior: str = "") -> dict:
    """Consulta todos los pasteles que pertenecen a una empresa específica."""
    global _last_context
    todos_pasteles = get_cakes()
    empresa_buscar = empresa if empresa else contexto_anterior
    if not empresa_buscar:
        return {"mensaje": "Por favor especifica el nombre de la empresa para ver sus pasteles."}
    
    empresa_normalizada = quitar_acentos(empresa_buscar.lower())
    filtrados = [p for p in todos_pasteles if p.get("business_name") and (empresa_normalizada in quitar_acentos(p.get("business_name").lower()))]
    if not filtrados:
        return {"mensaje": f"No encontré pasteles de la empresa '{empresa_buscar}' en Danhee Cake."}
    
    resultado = [{"nombre": p.get("name"), "precio": float(p.get("price", 0)) if p.get("price") else 0.0, "categoria": p.get("category_name", "Sin categoría")} for p in filtrados]
    _last_context["ultimos_pasteles"] = resultado
    lista = "\n".join([f"• **{pastel['nombre']}** - ${pastel['precio']} MXN - {pastel['categoria']}" for pastel in resultado])
    return {"empresa": empresa_buscar, "pasteles": resultado, "mensaje": f"🍰 Pasteles de {empresa_buscar}:\n{lista}"}

def consultar_mis_citas() -> dict:
    """Consulta las citas programadas para el usuario actual (cliente o repostero)."""
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No has iniciado sesión. Por favor inicia sesión para consultar tus citas. 🍰"}
    
    user = get_user_by_id(client_id)
    if not user:
        return {"mensaje": "Usuario no encontrado."}
    
    role = user.get("role", "cliente")
    if role == "repostero":
        citas = get_baker_appointments(client_id)
        if not citas:
            return {"mensaje": "👨‍🍳 No tienes citas de degustación o asesoría programadas actualmente."}
        lista_citas = [f"• 📅 {c.get('date')} a las {c.get('time_slot')} con cliente **{c.get('client_name')}** - Estado: {c.get('status')}" for c in citas]
        return {"citas": citas, "mensaje": "📅 **Tus citas programadas como repostero:**\n\n" + "\n".join(lista_citas)}
    else:
        citas = get_client_appointments(client_id)
        if not citas:
            return {"mensaje": "🧁 No tienes ninguna cita programada actualmente en Danhee Cake."}
        lista_citas = [f"• 📅 {c.get('date')} a las {c.get('time_slot')} con la pastelería **{c.get('baker_business_name')}** - Estado: {c.get('status')}" for c in citas]
        return {"citas": citas, "mensaje": "📅 **Tus citas de degustación programadas:**\n\n" + "\n".join(lista_citas)}

def consultar_mis_disenos() -> dict:
    """Consulta los diseños de pasteles personalizados del cliente actual."""
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No has iniciado sesión. Por favor inicia sesión para consultar tus diseños. 🎨"}
    
    user = get_user_by_id(client_id)
    if not user:
        return {"mensaje": "Usuario no encontrado."}
    
    role = user.get("role", "cliente")
    if role == "repostero":
        return {"mensaje": "Los reposteros no diseñan pasteles propios, sino que gestionan los pasteles de su catálogo."}
    
    disenos = get_client_designs(client_id)
    if not disenos:
        return {"mensaje": "🎨 Aún no tienes diseños personalizados guardados en Danhee Cake."}
    
    tamanio_map = {"sm": "Pequeño", "md": "Mediano", "lg": "Grande"}
    lista_disenos = [
        f"• **ID: {d['id']}** - Pastel {tamanio_map.get(d.get('size'), d.get('size'))} (Bizcocho: {d.get('sponge')}, Relleno: {d.get('filling')}, Decoración: {d.get('decoration')}) - Estado: {d.get('status')}"
        for d in disenos
    ]
    return {"disenos": disenos, "mensaje": "🎨 **Tus diseños de pasteles personalizados:**\n\n" + "\n".join(lista_disenos)}
