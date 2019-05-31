import Component from 'vue-class-component';
import Vue from 'vue';
import { LoadingProgress } from '@casual-simulation/aux-common/LoadingProgress';
import { appManager } from '../../../shared/AppManager';
import { hasValue } from '@casual-simulation/aux-common';

@Component({})
export default class Loading extends Vue {
    status: string = '';
    progress: number = 0;
    error: string = '';

    private showLoading: boolean = false;
    private showError: boolean = false;

    get show(): boolean {
        if (this.hasError) {
            return this.showError;
        } else {
            return this.showLoading;
        }
    }

    get hasError(): boolean {
        return hasValue(this.error);
    }

    created() {
        appManager.loadingProgress.onChanged.addListener(
            this.onLoadingProgressChanged
        );
    }

    beforeDestroy() {
        appManager.loadingProgress.onChanged.removeListener(
            this.onLoadingProgressChanged
        );
    }

    onErrorDismiss() {
        this.error = '';
        this.showError = false;
    }

    private onLoadingProgressChanged(progress: LoadingProgress) {
        if (!hasValue(this.error) && hasValue(progress.error)) {
            console.error(
                '[Loading] onLoadingProgressChanged error:',
                progress.error
            );
            this.error = progress.error;
            this.showError = true;
        }

        // console.log('[Loading] onLoadingProgressChanged show:', progress.show, 'progress:', progress.progress, 'status:', progress.status);
        this.status = progress.status;
        this.progress = progress.progress;
        this.showLoading = progress.show;
    }
}
