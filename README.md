# Portal de Viáticos Durandco

## Estructura para GitHub + Render

Sube **el contenido de esta carpeta** a la raíz del repositorio:

- Dockerfile
- package.json
- server.js
- render.yaml
- public/index.html

En Render puedes crear un **Blueprint** usando `render.yaml`,
o un Web Service Docker conectado al repositorio.

Health check:
`/api/health`

## Importante
Esta versión publica exactamente el `index.html` editable actual.
Los datos funcionales de esta versión se guardan en `localStorage`,
por lo que cada navegador conserva su propia información.
