package ac.baita.firetv

import ac.baita.firetv.ui.MainFragment
import android.os.Bundle
import androidx.fragment.app.FragmentActivity

/**
 * Activity unica que hospeda o [MainFragment] (a tela principal Leanback).
 */
class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction()
                .replace(R.id.main_browse_fragment, MainFragment())
                .commit()
        }
    }
}
