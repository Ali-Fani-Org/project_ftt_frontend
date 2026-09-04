export const preventDefault = <T extends Event>(fn: (e: T) => void): ((e: T) => void) => {
	return (e: T) => {
		e.preventDefault();
		fn(e);
	};
};

export class GlobalState {
	private _state = $state({ name: '', greet: '' });

	get greet() {
		return this._state.greet;
	}
	set greet(value: string) {
		this._state.greet = value;
	}
	get name() {
		return this._state.name;
	}
	set name(value: string) {
		this._state.name = value;
	}
	get nlen() {
		return this.name.length;
	}

	async submit() {
		if (typeof window === 'undefined' || !(window as any).__TAURI__) {
			throw new Error('Tauri command unavailable in web build');
		}
		const { invoke } = await import('@tauri-apps/api/core');
		this.greet = await invoke('greet', { name: this.name });
	}

	reset() {
		this.name = '';
		this.greet = '';
	}
}
