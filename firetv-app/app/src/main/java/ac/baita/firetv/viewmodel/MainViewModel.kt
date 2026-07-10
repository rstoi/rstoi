package ac.baita.firetv.viewmodel

import ac.baita.firetv.data.CatalogRepository
import ac.baita.firetv.data.ContinueWatchingRepository
import ac.baita.firetv.data.RecommendationRepository
import ac.baita.firetv.model.ContentItem
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Uma fileira da tela principal. */
data class Row(val title: String, val items: List<ContentItem>)

/** Estado agregado da tela principal. */
data class HomeUiState(
    val rows: List<Row> = emptyList(),
    val loading: Boolean = true,
)

/**
 * Carrega as tres fileiras de forma independente. Cada repositorio poderia
 * emitir separadamente para que uma fileira apareca antes da outra; aqui
 * juntamos por simplicidade do template.
 */
class MainViewModel(
    private val continueRepo: ContinueWatchingRepository = ContinueWatchingRepository(),
    private val catalogRepo: CatalogRepository = CatalogRepository(),
    private val recsRepo: RecommendationRepository = RecommendationRepository(),
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    fun load(userId: String = "demo-user") {
        viewModelScope.launch {
            val rows = buildList {
                continueRepo.getItems().takeIf { it.isNotEmpty() }?.let {
                    add(Row("Continuar assistindo", it))
                }
                add(Row("Novidades", catalogRepo.getNewReleases()))
                add(Row("Sugestoes para voce", recsRepo.getForUser(userId)))
            }
            _state.value = HomeUiState(rows = rows, loading = false)
        }
    }
}
