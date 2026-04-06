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
