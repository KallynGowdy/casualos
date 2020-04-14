import Vue from 'vue';
import Component from 'vue-class-component';
import { Prop, Watch } from 'vue-property-decorator';
import {
    Bot,
    isScript,
    isFormula,
    ScriptError,
    PrecalculatedBot,
    loadBots,
} from '@casual-simulation/aux-common';
import { BrowserSimulation } from '@casual-simulation/aux-vm-browser';
import { SubscriptionLike, Subscription } from 'rxjs';
import { appManager } from '../../AppManager';
import BotTag from '../BotTag/BotTag';
import MonacoEditor from '../MonacoEditor/MonacoEditor';
import {
    setup,
    loadModel,
    shouldKeepModelLoaded,
    unloadModel,
    watchSimulation,
    setActiveModel,
} from '../../MonacoHelpers';
import * as monaco from '../../MonacoLibs';
import { filter, tap } from 'rxjs/operators';
import groupBy from 'lodash/groupBy';
import sumBy from 'lodash/sumBy';

setup();

@Component({
    components: {
        'bot-tag': BotTag,
        'monaco-editor': MonacoEditor,
    },
})
export default class MonacoTagEditor extends Vue {
    @Prop({ required: true }) tag: string;
    @Prop({ required: true }) bot: Bot;

    private _simulation: BrowserSimulation;
    private _sub: Subscription;
    private _model: monaco.editor.ITextModel;
    private _allErrors: BotError[];
    private _errorIds: Set<string>;
    private _requestedErrors: Set<string>;

    scriptErrors: BotError[];

    showErrors: boolean;

    @Watch('tag')
    tagChanged() {
        this._updateModel();
    }

    @Watch('bot')
    botChanged() {
        this._updateModel();
    }

    get errorsCount() {
        return sumBy(this.scriptErrors, e => e.count);
    }

    get errorsLabel() {
        return this.errorsCount > 1
            ? `${this.errorsCount} Errors`
            : `${this.errorsCount} Error`;
    }

    get isScript() {
        if (this.bot && this.tag) {
            return isScript(this.bot.tags[this.tag]);
        }
        return false;
    }

    get isFormula() {
        if (this.bot && this.tag) {
            return isFormula(this.bot.tags[this.tag]);
        }
        return false;
    }

    constructor() {
        super();
        this.scriptErrors = [];
        this.showErrors = false;
    }

    created() {
        this._allErrors = [];
        this._errorIds = new Set();
        this._requestedErrors = new Set();
        this.showErrors = false;

        this._sub = new Subscription();
        this._sub.add(
            appManager.whileLoggedIn((user, sim) => {
                this._simulation = sim;
                const sub = watchSimulation(sim);

                const sub2 = sim.watcher.botsDiscovered
                    .pipe(
                        tap(bots => {
                            let update = false;
                            for (let b of bots) {
                                if (
                                    b.space !== 'error' ||
                                    b.values['auxError'] !== true
                                ) {
                                    continue;
                                }
                                if (this._errorIds.has(b.id)) {
                                    continue;
                                }

                                let error = {
                                    botId: b.values['auxErrorBot'],
                                    tag: b.values['auxErrorTag'],
                                    message: b.values['auxErrorMessage'],
                                    name: b.values['auxErrorName'],
                                    stack: b.values['auxErrorStack'],
                                } as BotError;

                                this._errorIds.add(b.id);
                                this._allErrors.push(error);

                                if (
                                    this.bot &&
                                    this.bot.id === error.botId &&
                                    this.tag === error.tag
                                ) {
                                    update = true;
                                }
                            }
                            if (update) {
                                this.$nextTick(() => {
                                    this._updateModel();
                                });
                            }
                        })
                    )
                    .subscribe(null, e => console.error(e));
                this._sub.add(sub);
                this._sub.add(sub2);
                return [sub];
            })
        );
    }

    mounted() {
        this._updateModel();
    }

    destroyed() {
        if (this._sub) {
            this._sub.unsubscribe();
        }
        setActiveModel(null);
    }

    editorFocused() {
        setActiveModel(this._model);
    }

    editorBlured() {
        setActiveModel(null);
    }

    toggleErrors() {
        this.showErrors = !this.showErrors;
    }

    private _updateModel() {
        const bot = this.bot;
        const tag = this.tag;

        const oldModel = this._model;
        this._model = loadModel(this._simulation, bot, tag);
        if (
            oldModel &&
            oldModel !== this._model &&
            !shouldKeepModelLoaded(oldModel)
        ) {
            unloadModel(oldModel);
        }

        if (this.$refs.editor) {
            (<MonacoEditor>this.$refs.editor).setModel(this._model);
        }

        const scriptErrors = this._allErrors.filter(
            e => e.botId === bot.id && e.tag === tag
        );
        const grouped = groupBy(scriptErrors, e => `${e.name}${e.message}`);
        this.scriptErrors = Object.keys(grouped).map(k => {
            let error = grouped[k][0];
            return {
                ...error,
                count: grouped[k].length,
            };
        });

        const requestId = `${bot.id}-${tag}`;
        if (!this._requestedErrors.has(requestId)) {
            this._requestedErrors.add(requestId);
            this._simulation.helper.transaction(
                loadBots('error', [
                    {
                        tag: 'auxError',
                        value: true,
                    },
                    {
                        tag: 'auxErrorBot',
                        value: bot.id,
                    },
                    {
                        tag: 'auxErrorTag',
                        value: tag,
                    },
                ])
            );
        }
    }
}

interface BotError {
    count: number;
    name: string;
    message: string;
    stack: string;
    tag: string;
    botId: string;
}
