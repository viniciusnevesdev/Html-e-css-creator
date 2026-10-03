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

## Biblioteca local

O app organiza o trabalho em **Biblioteca → Projeto → Componente → Editor**.

- **Projeto** agrupa componentes relacionados e tem nome amigável + ID técnico.
- **Componente** é uma definição reutilizável. Uma instância inserida no canvas recebe `data-component` e um `data-instance`; ela não cria outra definição na Biblioteca.
- `data-ui` continua sendo o tipo genérico (`text`, `button`, `container-v` etc.). A identidade semântica fica em `data-component` e `data-element`; nomes visíveis ficam em `data-name`.
- O armazenamento atual é local, através da interface `LocalLibraryStore`. A interface é a fronteira para uma futura sincronização, sem incluir nuvem, login ou credenciais agora.

### Pacotes abertos

`*.uicomp` é JSON UTF-8 legível, com um envelope que contém `component.json`, `component.html` e `component.css` como campos. `*.uiproject` contém os componentes e metadados de um projeto. Eles podem ser baixados, inspecionados, importados e versionados sem formato binário proprietário.

Na primeira abertura com a Biblioteca, o projeto anterior salvo em `mobile-ui-builder-project-v1` é **copiado**, sem apagar a chave antiga, para `Projeto atual / Editor atual`.

## Publicação
O repositório usa GitHub Actions para publicar automaticamente no GitHub Pages a cada alteração na branch `main`.

No iPhone: abra o link no Safari e use **Compartilhar → Adicionar à Tela de Início**.

## Observação
O GrapesJS é carregado por CDN na primeira abertura. O service worker tenta mantê-lo em cache conforme ele é usado.
