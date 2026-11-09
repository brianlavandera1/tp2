# TP3 · Dos sentencias. Dos soluciones — AutoMail AI (Sorteo S10-B)

**Institución:** IFTS N.º 29 — Desarrollo de Sistemas Web · Front End · 2.º cuatrimestre 2026
**Grupo:** Grupo 31 · **Sintaxia**
**Startup asignada por sorteo:** **AutoMail AI** (creada por estudiantes del **IFTS N.º 16**)
**Bloque asignado:** `S10-B` · Correo sospechoso y personalización (`Frase 1 · R3` y `Frase 2 · R4`)
**Tecnología:** HTML, CSS y JavaScript sin frameworks ni dependencias
**Construcción:** 100% agéntica (ningún archivo fue editado manualmente)

---

## 1. Enlaces de entrega

| | Enlace |
| :--- | :--- |
| **Repositorio** | https://github.com/GRUPO-31/TP3 |
| **Landing publicada** | https://tp3-grupo-31-2-a.vercel.app/ |

> La landing se publica en **Vercel**.

### Comprobación de enlaces sin sesión (ventana de incógnito)
- [ ] El repositorio abre sin iniciar sesión.
- [ ] La landing abre sin iniciar sesión y muestra la versión final (logo de AutoMail AI, dos sentencias, dos diagramas y dos desplegables).

*Marcar estas casillas recién después de abrir ambos enlaces en una ventana privada.*

---

## 2. Integrantes, roles y aportes

| Integrante | GitHub | Rol en el TP3 | Aporte concreto |
| :--- | :--- | :--- | :--- |
| **Brian Lavandera** | [@brianlavandera3](https://github.com/brianlavandera3) | Coordinación de instrucciones al agente | Entregó al agente la consigna y el sorteo `S10-B`, pidió las iteraciones de simplificación visual y subió el proyecto al repositorio del grupo. |
| **Diego Rodriguez** | [@diegojrodriguez](https://github.com/diegojrodriguez) | Análisis lógico de las sentencias | Revisó los conectores de `R3` y `R4` («y además», «o», negaciones) y que cada diagrama respete su regla. |
| **Sergio Vargas** | [@SergioVargas101](https://github.com/SergioVargas101) | Casos límite y excepciones | Propuso los casos límite: falla del detector antispam (`R3`) y correo mixto con consulta frecuente + reclamo (`R4`). |
| **Cristian Villagra** | [@Crrisst](https://github.com/Crrisst) | Pruebas en desktop y publicación | Probó el logo, los diagramas y los desplegables con clic y teclado, y verificó los enlaces públicos. |

### Revisión entre integrantes y mejora surgida
1. **Alcance de las reglas:** al principio hubo dudas sobre si había que resolver una sola frase. Al releer la consigna confirmamos que eran **las dos** y que están encadenadas: `R3` trata el correo sospechoso (`p`) y `R4` parte del correo no sospechoso (`¬p`). Por eso el Flujo 1 pasa al Flujo 2 cuando el correo no es sospechoso.
2. **Regla original vs. decisión del grupo:** al revisar los caminos `NO` notamos que las sentencias no dicen qué hacer en ese caso. Le pedimos al agente que los marcara con la etiqueta **«Decisión de diseño del grupo»**, para no presentar como obligatorio algo que la regla no establece.

---

## 3. Startup asignada

- **Nombre:** AutoMail AI
- **Origen:** estudiantes del IFTS N.º 16
- **Rubro:** Atención al cliente y correo
- **Objetivo:** asistente para clasificar correos y responder consultas frecuentes mediante respuestas aprobadas.
- **Logo:** original del material asignado, en `assets/automail-logo.webp`.

---

## 4. Fichas de las sentencias y propuestas

### Ficha 1 — Frase 1 · R3
| | |
| :--- | :--- |
| **Sentencia original** | «Si un correo se marca como sospechoso de spam, el sistema lo separa para revisión sin borrarlo ni responderlo automáticamente.» |
| **Datos necesarios** | Correo entrante (remitente, asunto, cuerpo) y la marca del filtro antispam. |
| **Condición** | El correo está marcado como sospechoso de spam. |
| **Consecuencia** | Separarlo para revisión, **sin** borrarlo **y sin** responderlo automáticamente. |

**Propuesta 1 — Filtro Seguro Anti-Spam.** Un agente consulta el detector antispam antes de contestar nada. Si el correo está marcado como sospechoso, lo mueve intacto a «Revisión» y bloquea cualquier respuesta automática. Así se evita responder a remitentes peligrosos y no se pierde ningún correo real por un falso positivo.

- **Viene de la regla:** separar, no borrar, no responder.
- **Agrega el grupo:** una persona revisa esa bandeja para rescatar correos legítimos; si el correo **no** es sospechoso, pasa al Flujo 2.
- **Caso límite:** si el detector falla o no responde a tiempo, por precaución tampoco borra ni responde, y avisa a una persona.
- **Prueba:** «Ganaste un premio, hacé clic acá» (marcado) → va a Revisión intacto. «¿Qué medios de pago aceptan?» (no marcado) → pasa al Flujo 2.

### Ficha 2 — Frase 2 · R4
| | |
| :--- | :--- |
| **Sentencia original** | «Si un correo no es sospechoso y además requiere personalización, contiene un reclamo, carece de respuesta aprobada o resulta ambiguo, el sistema lo deriva a una persona sin responder automáticamente.» |
| **Datos necesarios** | Resultado del Flujo 1 (no sospechoso), texto del correo y catálogo de respuestas aprobadas. |
| **Condición** | No sospechoso **Y** (requiere personalización **O** contiene reclamo **O** carece de respuesta aprobada **O** es ambiguo). Basta con una de las cuatro alertas. |
| **Consecuencia** | Derivar a una persona **sin** responder automáticamente. |

**Propuesta 2 — Derivador Inteligente a Personas.** Un segundo agente lee el correo ya validado y busca si existe una respuesta aprobada. Si detecta un reclamo, un pedido personal, falta de plantilla o un mensaje confuso, frena el envío automático, anota el motivo y lo deriva a una persona. El cliente recibe una respuesta humana justo cuando la necesita.

- **Viene de la regla:** derivar a una persona y no responder automáticamente cuando se da al menos una alerta.
- **Agrega el grupo:** registrar qué alerta disparó la derivación; si no se da ninguna alerta, el correo puede seguir al circuito de respuesta aprobada. La regla `R4` no define ese camino: es una decisión de diseño, y en AutoMail AI el envío automático depende además de otras reglas del sistema que no forman parte de este bloque.
- **Caso límite:** correo mixto que pregunta el horario (tiene plantilla) y además reclama un pedido demorado → no envía una respuesta parcial y deriva todo a una persona.
- **Prueba:** «Me cobraron dos veces la factura #9042» (reclamo) → derivado a una persona. «¿Qué días abre la sucursal Centro?» (ninguna alerta) → camino de respuesta aprobada.

---

## 5. Herramientas de IA: aplicaciones y modelos

| Aplicación (entorno) | Modelo (como figura en la aplicación) | Para qué se usó | Cambios solicitados |
| :--- | :--- | :--- | :--- |
| **Google Antigravity** | Gemini 4 Argon (Medium) | Generar `index.html`, `styles.css`, `script.js` y el primer README; maquetar los dos diagramas; accesibilidad con teclado. | Incluir las dos sentencias, el logo original, las etiquetas «Decisión de diseño del grupo», reducir texto y mover los detalles a desplegables. |
| **Claude Code** (app de escritorio) | Claude Opus 5.5 | Revisar la entrega contra la consigna y la rúbrica, probar la landing en el navegador, rediseñar el aspecto visual (`index.html` y `styles.css`) y reescribir este README. | Hacer la página más atractiva, agregar la sección «Cómo se conectan» con leyenda de colores, ajustar el camino «NO» del Flujo 2, unificar títulos y agregar el registro de pruebas. |

La landing es estática: **no** integra IA, no ejecuta agentes, no se conecta a APIs ni tiene backend. Los flujos solo se explican y se dibujan.

### Evidencia de iteración
1. **Instrucción inicial:** se le entregó a Antigravity la consigna del TP3 y los datos del sorteo `S10-B` (AutoMail AI, `R3` y `R4`), y se le pidió una landing clara para desktop.
2. **Problema detectado:** la primera versión tenía bloques repetidos, fórmulas lógicas a la vista y demasiado texto; costaba entender cada flujo de un vistazo.
3. **Pedido de mejora:** reducir el texto de la vista principal y lograr que cada flujo se entienda en segundos.
4. **Qué cambió y por qué:** la página quedó en tres bloques (startup, Solución 1, Solución 2); cada diagrama tiene pocos pasos y se bifurca en **SÍ / NO**; las herramientas, excepciones y ejemplos pasaron a los desplegables. Así lo principal se lee rápido y los detalles quedan a un clic, como pide la consigna.
5. **Revisión con Claude Code — lógica:** el camino «NO» del Flujo 2 mostraba que se enviaba la respuesta automática, pero la regla R4 no dice eso y AutoMail AI exige otras condiciones para responder sola. Se cambió a «pasa al circuito de respuesta aprobada», aclarando que es una decisión del grupo.
6. **Revisión con Claude Code — diseño:** pedimos que la página fuera más linda. Cambió a un hero oscuro con la paleta del logo (azul marino y verde menta), se agregó la sección **«Cómo se conectan»** que muestra que el Flujo 1 alimenta al Flujo 2, y una **leyenda** de colores. En los diagramas, lo que exige la regla tiene borde verde continuo y lo que agrega el grupo tiene borde azul **punteado**, así se distingue a simple vista. Los botones SÍ/NO también colorean el conector del camino elegido.
7. **Revisión final:** se detectó que los títulos de las propuestas en el README no coincidían con los de la landing y que faltaba publicar el sitio; se corrigió el README y se agregó el registro de pruebas.

---

## 6. Pruebas realizadas en desktop

Probado en Chromium con servidor local, a **1280×720**, **1366×768** y **1920×1080**:

| Prueba | Resultado |
| :--- | :--- |
| Sin scroll horizontal ni desbordes | ✅ |
| Logo de AutoMail AI completo y legible | ✅ |
| Barra de navegación lleva a cada sección y marca la activa | ✅ |
| Botones «Ver todo / Caso SÍ / Caso NO» resaltan el camino en ambos diagramas | ✅ |
| Desplegables abren y cierran con clic | ✅ |
| Desplegables abren con teclado (`Tab` + `Enter`) | ✅ |
| Consola del navegador sin errores | ✅ |

### Recorridos de cada flujo
| Flujo | Caso que cumple la condición | Caso que no la cumple |
| :--- | :--- | :--- |
| **1 · R3** | Correo marcado como spam → Revisión, sin borrar ni responder ✅ | Correo legítimo → pasa al Flujo 2 (decisión del grupo) ✅ |
| **2 · R4** | Reclamo → derivado a persona, sin respuesta automática ✅ | Consulta frecuente sin alertas → respuesta aprobada (decisión del grupo) ✅ |

---

## 7. Cómo ejecutarlo localmente

No necesita instalación ni compilación.

```bash
git clone https://github.com/GRUPO-31/TP3.git
cd TP3
python -m http.server 8080
```

Abrir `http://localhost:8080` en un navegador de escritorio (también funciona abriendo `index.html` directamente).

---

## 8. Estructura de archivos

```text
TP3/
├── assets/
│   └── automail-logo.webp   # Logo original de AutoMail AI
├── index.html               # Presentación, sentencias, dos diagramas y desplegables
├── styles.css               # Estilos para desktop
├── script.js                # Resaltado de caminos SÍ/NO, navegación activa e impresión
└── README.md
```
