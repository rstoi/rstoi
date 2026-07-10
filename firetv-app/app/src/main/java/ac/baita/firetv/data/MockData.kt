package ac.baita.firetv.data

import ac.baita.firetv.model.ContentItem

/**
 * Catalogo fake para rodar o app sem backend. Troque estes provedores por
 * chamadas Retrofit + cache Room quando ligar a API real.
 */
internal object MockData {

    private const val IMG = "https://picsum.photos/seed"

    private fun item(
        id: String,
        title: String,
        category: String,
        positionMin: Int = 0,
        durationMin: Int = 90,
    ) = ContentItem(
        id = id,
        title = title,
        description = "Descricao de exemplo para \"$title\". Substitua pelo texto real vindo do catalogo.",
        category = category,
        cardImageUrl = "$IMG/$id/313/176",
        backgroundImageUrl = "$IMG/$id/1280/720",
        positionMs = positionMin * 60_000L,
        durationMs = durationMin * 60_000L,
    )

    /** Itens com progresso parcial -> aparecem em "Continuar assistindo". */
    val continueWatching: List<ContentItem> = listOf(
        item("cw1", "A Jornada Inacabada", "Aventura", positionMin = 34, durationMin = 118),
        item("cw2", "Codigo Silencioso", "Thriller", positionMin = 12, durationMin = 95),
        item("cw3", "Ultima Fronteira - Ep. 4", "Serie", positionMin = 20, durationMin = 48),
    )

    /** Lancamentos recentes ordenados por "data" (aqui, apenas a ordem da lista). */
    val newReleases: List<ContentItem> = listOf(
        item("nr1", "Horizonte de Neon", "Ficcao Cientifica"),
        item("nr2", "O Peso do Silencio", "Drama"),
        item("nr3", "Corrida Contra o Tempo", "Acao"),
        item("nr4", "Raizes Profundas", "Documentario"),
        item("nr5", "Cartas de Inverno", "Romance"),
    )

    /** Sugestoes (num app real, calculadas no backend por usuario). */
    val suggestions: List<ContentItem> = listOf(
        item("sg1", "Porque voce assistiu Aventura", "Aventura"),
        item("sg2", "Popular esta semana", "Thriller"),
        item("sg3", "Novo na sua lista", "Comedia"),
        item("sg4", "Recomendado para voce", "Misterio"),
        item("sg5", "Em alta", "Acao"),
    )
}
