"""
db_config.py — Módulo de acceso a datos para el microservicio RAG de Danhee Cake.

En lugar de conectar directamente a MySQL (sin driver instalado), este módulo
realiza peticiones HTTP a la API REST de Node.js que corre en puerto 4000.
Esto centraliza la lógica de negocio y evita duplicar conexiones a la DB.
"""

import sys
import json
import urllib.request
import urllib.error
from typing import Optional, Any

# URL base de la API REST de Node.js
NODE_API_BASE = "http://127.0.0.1:4000/api"


def _http_get(path: str, timeout: int = 5) -> Optional[Any]:
    """
    Realiza una petición HTTP GET al servidor Node.js.

    Args:
        path: Ruta relativa de la API (ej. '/cakes').
        timeout: Tiempo máximo de espera en segundos.

    Returns:
        La respuesta JSON parseada, o None si ocurre un error.
    """
    url = f"{NODE_API_BASE}{path}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"[db_config] HTTP Error {e.code} en {url}: {e.reason}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[db_config] Error en GET {url}: {e}", file=sys.stderr)
        return None


def _http_post(path: str, payload: dict, timeout: int = 8) -> Optional[Any]:
    """
    Realiza una petición HTTP POST al servidor Node.js con un payload JSON.

    Args:
        path: Ruta relativa de la API (ej. '/appointments').
        payload: Diccionario con los datos a enviar.
        timeout: Tiempo máximo de espera en segundos.

    Returns:
        La respuesta JSON parseada, o None si ocurre un error.
    """
    url = f"{NODE_API_BASE}{path}"
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")
        except Exception:
            pass
        print(f"[db_config] HTTP Error {e.code} en POST {url}: {body}", file=sys.stderr)
        return {"error": f"HTTP {e.code}: {body}"}
    except Exception as e:
        print(f"[db_config] Error en POST {url}: {e}", file=sys.stderr)
        return {"error": str(e)}
