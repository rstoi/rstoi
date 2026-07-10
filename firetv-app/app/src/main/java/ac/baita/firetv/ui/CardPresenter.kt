package ac.baita.firetv.ui

import ac.baita.firetv.R
import ac.baita.firetv.model.ContentItem
import android.view.View
import android.view.ViewGroup
import android.widget.ProgressBar
import androidx.leanback.widget.ImageCardView
import androidx.leanback.widget.Presenter
import coil.load

/**
 * Desenha cada card das fileiras. Para itens com progresso (fileira
 * "Continuar assistindo"), exibe uma barra de progresso sobre a capa.
 *
 * O progresso e desenhado por um [ProgressBar] adicionado ao rodape da
 * [ImageCardView]; o id [R.id.card_progress] e declarado em res/values/ids.xml.
 */
class CardPresenter : Presenter() {

    private val cardWidth = 313
    private val cardHeight = 176

    override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
        val cardView = ImageCardView(parent.context).apply {
            isFocusable = true
            isFocusableInTouchMode = true
            setMainImageDimensions(cardWidth, cardHeight)

            // Barra de progresso sobreposta ao rodape do card.
            val bar = ProgressBar(
                context, null, android.R.attr.progressBarStyleHorizontal
            ).apply {
                id = R.id.card_progress
                max = 100
                visibility = View.GONE
            }
            addView(bar)
        }
        return ViewHolder(cardView)
    }

    override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
        val content = item as ContentItem
        val cardView = viewHolder.view as ImageCardView

        cardView.titleText = content.title
        cardView.contentText = content.category
        cardView.mainImageView.load(content.cardImageUrl) {
            placeholder(R.drawable.card_placeholder)
            error(R.drawable.card_placeholder)
        }

        val progressBar = cardView.findViewById<ProgressBar>(R.id.card_progress)
        if (content.progress > 0f) {
            progressBar.visibility = View.VISIBLE
            progressBar.progress = (content.progress * 100).toInt()
        } else {
            progressBar.visibility = View.GONE
        }
    }

    override fun onUnbindViewHolder(viewHolder: ViewHolder) {
        (viewHolder.view as ImageCardView).mainImage = null
    }
}
