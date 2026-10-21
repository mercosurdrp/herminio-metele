"""Digiere el «Listado de cumplimiento de estandar» de Herminio → app/estandar/datos.json.

Uso: python3 scripts/estandar_extraer.py "<ruta al .xlsx>" [AAAA-MM-DD]

Hojas ST-CAMIONES / ST-AE: una fila por patente × ítem con AVANCE (1 / 0 / 0,5
parcial / N/A) y ALCANCE (MANDATORIO / EXCELENCIA). N/A no entra al denominador.
El auditor pide el cumplimiento de cada alcance por separado: cada unidad, tipo e
ítem lleva su % mandatorio y su % excelencia, además del total combinado.
"""
import datetime
import json
import os
import sys
from collections import defaultdict

import openpyxl

ALCANCES = ["MANDATORIO", "EXCELENCIA"]
EXCLUIDAS = {"HIE914"}  # pasó a otro negocio (pedido de Herminio, jun-2026)
RENOMBRAR = {"AB399KZ": "AF399KZ"}  # tipeo en la planilla; el padrón de flota dice AF399KZ
ITEMS_RENOMBRAR = {  # mismo ítem escrito distinto según la unidad
    "BLOQUE DE ENCENDIDO DEL MOTOR POR USO DEL CINTURON DE SEGURIDAD":
        "BLOQUEO DE ENCENDIDO DEL MOTOR POR USO DEL CINTURON DE SEGURIDAD",
}
# columnas (0-based): avance, observación, alcance
HOJAS = {"camiones": ("ST-CAMIONES", 8, 9, 10), "autoelevadores": ("ST-AE", 5, 6, 7)}


def pct(c, t):
    return round(100 * c / t, 1) if t else None


def resumen(c, t):
    return {"cumple": c, "total": t, "pct": pct(c, t)}


def leer(ws, ca, co, cal):
    filas = []
    for r in ws.iter_rows(min_row=4, values_only=True):
        if not r[0] or str(r[0]).strip() == "PATENTE":
            continue
        av = r[ca]
        if av not in (0, 1, 0.5):
            continue  # N/A o vacío: no aplica
        p = str(r[0]).strip()
        p = RENOMBRAR.get(p, p)
        if p in EXCLUIDAS:
            continue
        alc = str(r[cal]).strip().upper() if r[cal] else "MANDATORIO"
        filas.append({
            "patente": p,
            "item": ITEMS_RENOMBRAR.get(str(r[1]).strip(), str(r[1]).strip()),
            "avance": av,
            "obs": str(r[co]).strip() if r[co] else "",
            "alcance": alc,
        })
    return filas


def digerir(filas):
    uni = defaultdict(list)
    for f in filas:
        uni[f["patente"]].append(f)

    unidades = []
    for p, fs in uni.items():
        u = {"patente": p, **resumen(sum(f["avance"] for f in fs), len(fs)), "alcances": {}}
        for a in ALCANCES:
            fa = [f for f in fs if f["alcance"] == a]
            if fa:
                u["alcances"][a] = resumen(sum(f["avance"] for f in fa), len(fa))
        u["pendientes"] = [
            {"item": f["item"], "obs": f["obs"], "alcance": f["alcance"], "parcial": f["avance"] == 0.5}
            for f in sorted(fs, key=lambda f: (ALCANCES.index(f["alcance"]), f["item"]))
            if f["avance"] < 1
        ]
        unidades.append(u)
    unidades.sort(key=lambda u: (u["alcances"].get("MANDATORIO", {}).get("pct") or 0, u["pct"]))

    def items_de(fs_items, con_alcance):
        clave = (lambda f: (f["item"], f["alcance"])) if con_alcance else (lambda f: f["item"])
        grupos = defaultdict(list)
        for f in fs_items:
            grupos[clave(f)].append(f)
        out = []
        for k, fs in grupos.items():
            c = sum(f["avance"] for f in fs)
            obs = next((f["obs"] for f in fs if f["avance"] < 1 and f["obs"]), "")
            it = {
                "item": k[0] if con_alcance else k,
                **resumen(c, len(fs)),
                "aplican": [f["patente"] for f in fs],
                "noOk": [f["patente"] for f in fs if f["avance"] < 1],
                "parciales": [f["patente"] for f in fs if f["avance"] == 0.5],
                "obs": obs,
            }
            if con_alcance:
                it["alcance"] = k[1]
            out.append(it)
        out.sort(key=lambda i: (i["pct"], i["item"]))
        return out

    items = items_de(filas, False)
    tot = sum(f["avance"] for f in filas)
    alc = {}
    for a in ALCANCES:
        fa = [f for f in filas if f["alcance"] == a]
        if fa:
            ia = items_de(fa, True)
            alc[a] = {**resumen(sum(f["avance"] for f in fa), len(fa)),
                      "itemsTotal": len(ia), "itemsOk": sum(1 for i in ia if not i["noOk"])}
    return {
        **resumen(tot, len(filas)),
        "alcances": alc,
        "unidades": unidades,
        # «items» = combinado (formato previo); «itemsAlcance» = un registro por ítem × alcance
        "items": [i for i in items if i["noOk"]],
        "itemsOk": sum(1 for i in items if not i["noOk"]),
        "itemsTotal": len(items),
        "itemsAlcance": items_de(filas, True),
    }


def main():
    xlsx = sys.argv[1]
    fecha = sys.argv[2] if len(sys.argv) > 2 else datetime.date.fromtimestamp(os.path.getmtime(xlsx)).isoformat()
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    datos = {"actualizado": fecha}
    for key, (hoja, ca, co, cal) in HOJAS.items():
        datos[key] = digerir(leer(wb[hoja], ca, co, cal))
    destino = os.path.join(os.path.dirname(__file__), "..", "app", "estandar", "datos.json")
    with open(destino, "w", encoding="utf-8") as fh:
        json.dump(datos, fh, ensure_ascii=False, indent=1)
    for key in HOJAS:
        d = datos[key]
        print(key, d["pct"], {a: v["pct"] for a, v in d["alcances"].items()}, len(d["unidades"]), "unidades")


if __name__ == "__main__":
    main()
