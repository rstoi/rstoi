# Fire TV App — esqueleto (Kotlin + Leanback)

App Android TV / Fire TV de exemplo com a tela principal em três fileiras:

- **Continuar assistindo** — itens com progresso parcial (barra de progresso no card).
- **Novidades** — feed do catálogo por data.
- **Sugestões para você** — recomendações (num app real, calculadas no backend).

Os dados são **mock** (`data/MockData.kt`), para o app rodar sem backend. As
imagens usam `picsum.photos`, então é preciso conexão de rede na primeira carga.

## Arquitetura

```
UI (Leanback)            MainActivity → MainFragment (BrowseSupportFragment)
                         CardPresenter (card + barra de progresso)
        │
ViewModel                MainViewModel (StateFlow<HomeUiState>)
        │
Repositories             ContinueWatchingRepository | CatalogRepository | RecommendationRepository
        │
Fonte de dados           MockData  (troque por Retrofit + Room)
```

- **MVVM** com `ViewModel` + `StateFlow`.
- **Leanback** (`BrowseSupportFragment`) para a UI de TV (fileiras, foco, D-pad).
- **Coil** para carregar as capas.

Cada uma das três funcionalidades é uma fileira independente com seu próprio
repositório e regra de negócio. A ideia é manter a lógica pesada
(recomendações, ordenação de novidades, regras de progresso) no **backend**;
o app só renderiza e faz cache.

## Estrutura

```
app/src/main/
  AndroidManifest.xml            # LEANBACK_LAUNCHER + uses-feature leanback
  java/ac/baita/firetv/
    MainActivity.kt
    ui/MainFragment.kt           # monta as 3 fileiras
    ui/CardPresenter.kt          # card + barra de progresso (Continuar)
    model/ContentItem.kt
    data/Repositories.kt         # 3 repositórios (suspend)
    data/MockData.kt             # catálogo fake
    viewmodel/MainViewModel.kt
  res/                           # layout, tema Leanback, cores, banner, ícone
```

## Como compilar e rodar

Requisitos: Android Studio (Koala ou superior) e um Fire TV / emulador Android TV.

1. **Abra `firetv-app/` no Android Studio.** Ele gera o Gradle Wrapper e baixa as
   dependências automaticamente. (Via linha de comando, rode `gradle wrapper`
   uma vez para gerar `gradlew` + `gradle-wrapper.jar`, depois `./gradlew assembleDebug`.)
2. **Gere o APK:** `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.
3. **Instale no Fire TV** (com ADB pela rede):
   ```bash
   adb connect <ip-do-firetv>:5555
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```
   Ative antes *Configurações → Meu Fire TV → Opções de desenvolvedor → Depuração ADB*.
4. O app aparece na home do Fire TV (por causa do `LEANBACK_LAUNCHER`).

## Próximos passos (do template para produção)

- **Player:** integrar **ExoPlayer/Media3** (DASH/HLS, DRM Widevine, legendas).
- **Continuar assistindo:** salvar progresso a cada ~10s e ao sair
  (`ContinueWatchingRepository.saveProgress`), persistir em **Room** e
  sincronizar com o backend. Regra: mostrar só com progresso entre ~2% e ~95%.
- **Novidades / Sugestões:** trocar `MockData` por **Retrofit** + cache Room (TTL).
- **Tela de detalhes:** `DetailsSupportFragment` antes de reproduzir.
- **Integração com a home do Fire TV:** publicar "Continuar assistindo" e
  recomendações na tela inicial do sistema (API de integração do launcher).
- **Polimento de 10-foot UI:** foco/D-pad em tudo, margens de overscan (~5%),
  estados de loading/erro/offline.
- **Publicação:** empacotar e enviar pelo **Amazon Appstore Developer Console**.
