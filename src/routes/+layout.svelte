<script lang="ts">
	import '../app.css';
	import { currentTheme, colorMode } from '../lib/stores/theme';

	let { children } = $props();

	$effect(() => {
		// This effect ensures the theme and color mode are applied when the layout mounts
		// and whenever the stores change. The applyTheme function handles setting CSS variables
		// and localStorage.
		currentTheme.subscribe((themeName) => {
			colorMode.subscribe((mode) => {
				// applyTheme is already called within the theme store's subscribe block
				// This effect is primarily to ensure the initial application on page load
				// and to react to any external changes to the stores if they were not already handled.
			});
		});
	});
</script>

{@render children()}
