# UI Builder Mobile

PWA mobile-first de editor visual para HTML/CSS, pensado para uso no iPhone.

## Link
https://viniciusnevesdev.github.io/Html-e-css-creator/

## O que já funciona
- Canvas real em HTML/CSS usando GrapesJS
- Container vertical e horizontal
- Sobreposição
- Texto, botão, imagem, Spacer e divisor
- Seleção visual no canvas
- Painel de Camadas
- Largura Full/Fit/Fixa
- Altura, gap, padding e margin
- Direção, alinhamento e distribuição
- Fundo, cor, borda, raio, opacidade e overflow
- Duplicar, excluir e reordenar
- Páginas múltiplas
- Undo/redo
- Salvamento automático e manual via localStorage
- Exportação de HTML e CSS
- Manifest + service worker para instalação como PWA

## Publicação
O repositório usa GitHub Actions para publicar automaticamente no GitHub Pages a cada alteração na branch `main`.

No iPhone: abra o link no Safari e use **Compartilhar → Adicionar à Tela de Início**.

## Observação
O GrapesJS é carregado por CDN na primeira abertura. O service worker tenta mantê-lo em cache conforme ele é usado.
