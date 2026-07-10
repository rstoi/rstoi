package ac.baita.firetv.model

/**
 * Um item de conteudo do catalogo (filme, episodio, etc.).
 *
 * O mesmo modelo alimenta as tres fileiras. Para "Continuar assistindo" os
 * campos [positionMs] e [durationMs] sao usados para desenhar a barra de
 * progresso; nas demais fileiras o progresso fica em 0.
 */
data class ContentItem(
    val id: String,
    val title: String,
    val description: String,
    val category: String,
    val cardImageUrl: String,
    val backgroundImageUrl: String = cardImageUrl,
    val videoUrl: String = "",
    /** Posicao ja assistida, em milissegundos (0 = nao iniciado). */
    val positionMs: Long = 0,
    /** Duracao total do conteudo, em milissegundos. */
    val durationMs: Long = 0,
) {
    /** Progresso de 0.0 a 1.0 usado pela barra na fileira "Continuar". */
    val progress: Float
        get() = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
}
