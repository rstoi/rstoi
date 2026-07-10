package ac.baita.firetv.data

import ac.baita.firetv.model.ContentItem
import kotlinx.coroutines.delay

/**
 * Fonte de "Continuar assistindo".
 *
 * Num app real: leia o progresso salvo localmente (Room) e sincronize com o
 * backend. Aplique as regras de negocio de progresso (2%..95%) e ordene por
 * ultima visualizacao decrescente.
 */
class ContinueWatchingRepository {
    suspend fun getItems(): List<ContentItem> {
        delay(150) // simula I/O
        return MockData.continueWatching
            .filter { it.progress in 0.02f..0.95f }
            .sortedByDescending { it.positionMs } // proxy de "ultima visualizacao"
    }

    /** Salvo pelo player a cada ~10s e ao pausar/sair. Aqui e um no-op de exemplo. */
    suspend fun saveProgress(contentId: String, positionMs: Long, durationMs: Long) {
        // TODO: persistir em Room e enviar ao backend.
    }
}

/**
 * Catalogo / "Novidades". Num app real: GET /catalog/new ordenado por data,
 * com cache local (TTL) para a tela abrir rapido.
 */
class CatalogRepository {
    suspend fun getNewReleases(): List<ContentItem> {
        delay(150)
        return MockData.newReleases
    }
}

/**
 * "Sugestoes". A logica pesada fica no backend (regras, filtragem
 * colaborativa ou ML). O app apenas consome a lista pronta.
 */
class RecommendationRepository {
    suspend fun getForUser(userId: String): List<ContentItem> {
        delay(200)
        return MockData.suggestions
    }
}
