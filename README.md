# GestuPlay

GestuPlay é uma plataforma de jogos hands-free que transforma sua webcam em um controle imersivo. Utilizando algoritmos de Visão Computacional (MediaPipe Hands), o projeto elimina a necessidade de periféricos tradicionais, permitindo que o usuário interaja com diversos mini-games através de movimentos corporais e gestos manuais.

---

## 🏗 Arquitetura

```
src/
├── core/
│   ├── EMAFilter.ts        # Filtro de suavização (Média Móvel Exponencial)
│   ├── IGestuGame.ts       # Interface que todos os jogos devem implementar
│   ├── VisionManager.ts    # Singleton – gerencia webcam + Observer pattern
│   └── VisionWorker.ts     # Web Worker – processa MediaPipe off-main-thread
├── games/
│   └── SlingshotGame.ts    # Gemini Slingshot (gesto de pinça)
├── components/
│   ├── DwellButton.tsx     # Botão ativado por tempo de hover (dwell click)
│   ├── GameCanvas.tsx      # Canvas com game loop integrado ao VisionManager
│   └── VirtualCursor.tsx   # Cursor virtual que segue a ponta do indicador
├── hooks/
│   ├── useVisionCursor.ts  # Hook React para posição suavizada do cursor
│   └── useWindowSize.ts    # Hook React para dimensões da janela
├── App.tsx                 # Hub principal (idle → loading → playing)
└── main.tsx
```

## 🚀 Instalação e execução

```bash
# Instalar dependências
npm install

# Desenvolvimento (com HMR)
npm run dev

# Build para produção
npm run build

# Preview do build
npm run preview
```

> **Nota:** O navegador precisará de permissão de câmera. A aplicação processa tudo localmente – nenhum dado é enviado a servidores.

## 🎮 Como jogar – Gemini Slingshot

1. Aponte a câmera para a sua mão.
2. Junte o polegar e o indicador (**gesto de pinça**) sobre o estilingue para agarrá-lo.
3. Afaste a mão para tensionar o elástico.
4. Abra os dedos para **disparar** e acertar as estrelas.

## 🖐 Interface Natural (NUI)

- **Cursor Virtual** – segue a ponta do indicador em tempo real, com suavização EMA.
- **Dwell Click** – aponte o dedo para um botão e aguarde ~1,5 s; um anel de progresso confirma a seleção.

## 🔒 Privacidade & Deploy

- Todo o processamento de imagem ocorre **no navegador** via MediaPipe WASM.
- O `netlify.toml` inclui os headers `COOP`/`COEP` obrigatórios para isolamento cross-origin.
- Deploy estático compatível com **Netlify** (custo zero de servidor).

## 🎨 Referência de Design (Hub)

Exemplo de direção visual moderna para o hub:

- **Inspiração:** GitHub dashboard + Vercel + Notion
- **Layout:** painel central com borda sutil, fundo com gradiente escuro e orbs desfocados
- **Hierarquia:** título forte, subtítulo curto, tags de contexto (Local Processing / MediaPipe / Zero Server Cost)
- **Microinterações:** hover com elevação, transições suaves e animação de entrada do painel
- **Responsividade:** conteúdo fluido com `clamp()`, grid/flex adaptativo e espaçamento consistente

## 🧠 Melhorias de Precisão para Visão Computacional

Problemas comuns de inconsistência (abrir/fechar mão):

- iluminação ruim ou contra-luz
- FPS baixo/instável
- thresholds sem histerese (chattering)
- ruído de landmark frame-a-frame
- perda de tracking em movimentos rápidos

Melhorias aplicadas no MVP:

- suavização temporal da distância de pinça (EMA local)
- histerese de gesto (threshold de fechar diferente do de abrir)
- debounce por frames consecutivos para confirmar mudança de estado
- ajuste de captura para melhor FPS (`ideal` 60) e tracking confidence maior

Melhorias recomendadas para próximos passos:

- usar métrica combinada (distância + ângulo dos dedos + velocidade)
- adicionar estado explícito de `tracking_lost` com timeout curto
- calibrar thresholds por usuário (fase de setup de 3-5s)
- migrar para solução com modelos mais robustos (ex.: MediaPipe Tasks Vision / hand-landmarker com pipeline dedicado)
