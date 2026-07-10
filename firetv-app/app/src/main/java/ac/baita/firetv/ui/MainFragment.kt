package ac.baita.firetv.ui

import ac.baita.firetv.model.ContentItem
import ac.baita.firetv.viewmodel.MainViewModel
import android.os.Bundle
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.viewModels
import androidx.leanback.app.BrowseSupportFragment
import androidx.leanback.widget.ArrayObjectAdapter
import androidx.leanback.widget.HeaderItem
import androidx.leanback.widget.ListRow
import androidx.leanback.widget.ListRowPresenter
import androidx.leanback.widget.OnItemViewClickedListener
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.Lifecycle
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * Tela principal. Um [BrowseSupportFragment] com um adapter vertical de
 * fileiras ([ListRow]); cada fileira ("Continuar", "Novidades", "Sugestoes")
 * tem seu proprio adapter horizontal de cards.
 */
class MainFragment : BrowseSupportFragment() {

    private val viewModel: MainViewModel by viewModels()
    private val rowsAdapter = ArrayObjectAdapter(ListRowPresenter())

    override fun onActivityCreated(savedInstanceState: Bundle?) {
        super.onActivityCreated(savedInstanceState)

        title = getString(ac.baita.firetv.R.string.app_name)
        headersState = HEADERS_ENABLED
        isHeadersTransitionOnBackEnabled = true
        brandColor = ContextCompat.getColor(requireContext(), ac.baita.firetv.R.color.brand)

        adapter = rowsAdapter
        setupEventListeners()
        observeState()
        viewModel.load()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.state.collectLatest { state ->
                    rowsAdapter.clear()
                    val cardPresenter = CardPresenter()
                    state.rows.forEachIndexed { index, row ->
                        val listRowAdapter = ArrayObjectAdapter(cardPresenter)
                        row.items.forEach { listRowAdapter.add(it) }
                        val header = HeaderItem(index.toLong(), row.title)
                        rowsAdapter.add(ListRow(header, listRowAdapter))
                    }
                }
            }
        }
    }

    private fun setupEventListeners() {
        onItemViewClickedListener = OnItemViewClickedListener { _, item, _, _ ->
            if (item is ContentItem) {
                // Num app real: abrir a tela de detalhes ou o player.
                // Para "Continuar", retomar de item.positionMs (player.seekTo).
                val msg = if (item.progress > 0f) {
                    "Retomar \"${item.title}\" em ${(item.progress * 100).toInt()}%"
                } else {
                    "Abrir \"${item.title}\""
                }
                Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
            }
        }
    }
}
