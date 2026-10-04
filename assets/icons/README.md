# Ícones do UI Builder

Esta pasta contém os ícones visuais usados pela interface do editor.

## Como trocar um ícone

1. Abra `assets/icons` no GitHub.
2. Localize o arquivo do ícone que deseja substituir.
3. Substitua-o por outro arquivo SVG mantendo **exatamente o mesmo nome**.
4. Faça o commit da alteração.
5. Depois que o GitHub Pages atualizar, o novo desenho será usado em todos os lugares que apontam para esse ícone.

Exemplo: para trocar todos os botões de fechar, substitua `close.svg` por outro SVG chamado `close.svg`.

## Importante

- Mantenha o formato SVG.
- O SVG deve ter `viewBox`.
- Prefira `currentColor` em `fill` ou `stroke` para o ícone acompanhar a cor da interface.
- Não coloque largura/altura fixa no arquivo se não for necessário. O tamanho visual é controlado pelo CSS.
- Não renomeie um arquivo sem também atualizar suas referências no código.

## Arquivos

- `back.svg` — voltar.
- `close.svg` — fechar painéis e janelas.
- `container-horizontal.svg` — container horizontal.
- `container-vertical.svg` — container vertical.
- `export.svg` — exportar.
- `home.svg` — Biblioteca/início.
- `info.svg` — ajuda contextual.
- `layers.svg` — aba Camadas.
- `pages.svg` — aba Páginas.
- `preview.svg` — pré-visualização.
- `redo.svg` — refazer.
- `spacer.svg` — espaçador.
- `style.svg` — aba Estilo.
- `undo.svg` — desfazer.

## Tamanhos

Os tamanhos compartilhados ficam em `styles.css`, nas variáveis `--icon-*` no início do arquivo. Alterar uma variável muda todas as instâncias daquela categoria.
