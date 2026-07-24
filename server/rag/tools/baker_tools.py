"""
baker_tools.py — Herramientas y funciones especializadas para el Agente de Reposteros en Danhee Cake.
"""

import sys
from pathlib import Path

base_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(base_dir))

from db_config import (
    get_categories, get_baker_profile_by_user_id,
    get_baker_cakes, add_baker_cake, update_baker_cake, delete_baker_cake
)
from tools.common_tools import quitar_acentos, _get_current_client_id

def listar_mis_pasteles() -> dict:
    """Muestra la lista de pasteles asociados al catálogo del repostero autenticado."""
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No estás autenticado. Por favor inicia sesión como repostero."}
    
    baker = get_baker_profile_by_user_id(client_id)
    if not baker:
        return {"mensaje": "No se encontró un perfil de repostero para tu usuario."}
    
    cakes = get_baker_cakes(baker["id"])
    if not cakes:
        return {"mensaje": "Aún no tienes pasteles registrados en tu catálogo. ¡Puedes pedirme que agregue uno!"}
    
    lista = []
    for c in cakes:
        destacado = "⭐ Destacado" if c.get("is_featured") else ""
        cat = c.get("category_name") or "Sin categoría"
        desc = c.get("description") or "Sin descripción"
        precio = float(c.get("price", 0))
        lista.append(f"• **ID: {c['id']}** - **{c['name']}** - ${precio:.2f} MXN - Categoría: {cat} - {desc} {destacado}")
    
    mensaje = "🍰 **Tus pasteles registrados:**\n\n" + "\n".join(lista)
    return {
        "pasteles": cakes,
        "cantidad": len(cakes),
        "mensaje": mensaje
    }

def agregar_nuevo_pastel(nombre: str, precio: float, categoria: str = None, descripcion: str = None) -> dict:
    """Agrega un nuevo pastel al catálogo del repostero."""
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No estás autenticado. Por favor inicia sesión como repostero."}
    
    baker = get_baker_profile_by_user_id(client_id)
    if not baker:
        return {"mensaje": "No se encontró un perfil de repostero para tu usuario."}
    
    category_id = None
    if categoria:
        cats = get_categories()
        categoria_norm = quitar_acentos(categoria.lower())
        for cat in cats:
            if categoria_norm in quitar_acentos(cat["name"].lower()) or quitar_acentos(cat["slug"].lower()) in categoria_norm:
                category_id = cat["id"]
                break
    
    cake_id = add_baker_cake(baker["id"], category_id, nombre, descripcion, precio)
    if cake_id:
        return {
            "success": True,
            "cake_id": cake_id,
            "mensaje": f"✅ ¡Pastel **'{nombre}'** agregado exitosamente a tu catálogo con un precio de ${precio:.2f} MXN! (ID asignado: {cake_id})"
        }
    else:
        return {"mensaje": "❌ Ocurrió un error al intentar registrar el pastel en la base de datos."}

def actualizar_mi_pastel(pastel_id: int, nombre: str = None, precio: float = None, descripcion: str = None, categoria: str = None) -> dict:
    """Actualiza la información de un pastel existente del repostero."""
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No estás autenticado. Por favor inicia sesión como repostero."}
    
    baker = get_baker_profile_by_user_id(client_id)
    if not baker:
        return {"mensaje": "No se encontró un perfil de repostero para tu usuario."}
    
    cakes = get_baker_cakes(baker["id"])
    target_cake = None
    for c in cakes:
        if c["id"] == int(pastel_id):
            target_cake = c
            break
            
    if not target_cake:
        return {"mensaje": f"No se encontró el pastel con ID {pastel_id} en tu catálogo. Verifica que el ID sea correcto."}
    
    new_nombre = nombre if nombre is not None else target_cake["name"]
    new_precio = float(precio) if precio is not None else float(target_cake["price"])
    new_descripcion = descripcion if descripcion is not None else target_cake["description"]
    
    category_id = target_cake["category_id"]
    if categoria:
        cats = get_categories()
        categoria_norm = quitar_acentos(categoria.lower())
        for cat in cats:
            if categoria_norm in quitar_acentos(cat["name"].lower()) or quitar_acentos(cat["slug"].lower()) in categoria_norm:
                category_id = cat["id"]
                break
                
    is_featured = target_cake.get("is_featured", 0)
    
    success = update_baker_cake(baker["id"], int(pastel_id), new_nombre, new_descripcion, new_precio, category_id, is_featured)
    if success:
        return {
            "success": True,
            "mensaje": f"✅ El pastel **'{new_nombre}'** (ID: {pastel_id}) ha sido actualizado correctamente."
        }
    else:
        return {"mensaje": "❌ No se pudo actualizar el pastel. Intenta de nuevo."}

def eliminar_mi_pastel(pastel_id: int) -> dict:
    """Elimina un pastel del catálogo del repostero."""
    client_id = _get_current_client_id()
    if not client_id:
        return {"mensaje": "No estás autenticado. Por favor inicia sesión como repostero."}
    
    baker = get_baker_profile_by_user_id(client_id)
    if not baker:
        return {"mensaje": "No se encontró un perfil de repostero para tu usuario."}
        
    success = delete_baker_cake(baker["id"], int(pastel_id))
    if success:
        return {
            "success": True,
            "mensaje": f"✅ El pastel con ID {pastel_id} ha sido eliminado correctamente de tu catálogo."
        }
    else:
        return {"mensaje": f"❌ No se encontró o no se pudo eliminar el pastel con ID {pastel_id}."}

def listar_categorias_disponibles() -> dict:
    """Lista las categorías de pasteles activas para que el repostero sepa cuáles asignar."""
    cats = get_categories()
    if not cats:
        return {"mensaje": "No hay categorías registradas actualmente."}
        
    lista = [f"• **{c['name']}** (Slug: `{c['slug']}`)" for c in cats]
    mensaje = "🏷️ **Categorías de pasteles disponibles:**\n\n" + "\n".join(lista)
    return {
        "categorias": cats,
        "mensaje": mensaje
    }
