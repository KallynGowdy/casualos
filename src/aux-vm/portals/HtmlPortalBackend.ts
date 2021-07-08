import {
    action,
    AuxRuntime,
    Bot,
    BotAction,
    registerHtmlPortal,
    SerializableMutationRecord,
    updateHtmlPortal,
} from '@casual-simulation/aux-common';
import { AuxHelper } from '../vm';
import { PortalBackend } from './PortalBackend';
import { v4 as uuid } from 'uuid';
import undom from '@casual-simulation/undom';

/**
 * Defines a class that is used to communicate HTML changes for a custom html portal.
 */
export class HtmlPortalBackend implements PortalBackend {
    portalId: string;
    botId: string;

    private _helper: AuxHelper;
    private _initTaskId: string;
    private _document: Document;
    private _mutationObserver: MutationObserver;
    private _nodes: Map<string, Node> = new Map<string, Node>();

    /**
     * the list of properties that should be disallowed.
     * Taken from https://github.com/developit/preact-worker-demo/blob/master/src/renderer/worker.js
     */
    private _propDenylist: Set<string> = new Set([
        'children',
        'parentNode',
        '__handlers',
        '_component',
        '_componentConstructor',
    ]);

    /**
     * The list of properties that should be converted to references.
     * Taken from https://github.com/developit/preact-worker-demo/blob/master/src/renderer/worker.js
     */
    private _propReferenceList: Set<string> = new Set([
        'target',
        'addedNodes',
        'removedNodes',
        'nextSibling',
        'previousSibling',
    ]);

    private _idCounter = 0;

    constructor(portalId: string, botId: string, helper: AuxHelper) {
        this.portalId = portalId;
        this.botId = botId;

        this._helper = helper;

        this._initTaskId = uuid();
        let doc = (this._document = undom());

        this._mutationObserver = new doc.defaultView.MutationObserver(
            this._processMutations.bind(this)
        );
        this._mutationObserver.observe(doc, {
            subtree: true,
        });
        this._helper.transaction(
            registerHtmlPortal(this.portalId, this._initTaskId)
        );
    }

    handleEvents(events: BotAction[]): void {
        for (let event of events) {
            if (event.type === 'async_result') {
                if (event.taskId === this._initTaskId) {
                    this._startRender();
                }
            } else if (event.type === 'html_portal_event') {
                if (event.portalId === this.portalId) {
                    let target = this._getNode(event.event.target);
                    if (target && target.dispatchEvent) {
                        let finalEvent = {
                            ...event.event,
                            target: target,
                            bubbles: true,
                        };
                        target.dispatchEvent(finalEvent);
                    }
                }
            }
        }
    }

    dispose(): void {}

    private _getNode(node: any): Node {
        let id: string;
        if (node && typeof node === 'object') {
            id = node.__id;
        } else if (typeof node === 'string') {
            id = node;
        }
        if (!id) {
            return null;
        }

        if (node.nodeName === 'BODY') {
            return document.body;
        }
        return this._nodes.get(id);
    }

    private _startRender() {
        this._helper.transaction(
            action('onRender', [this.botId], undefined, {
                document: this._document,
            })
        );
    }

    private _processMutations(mutations: MutationRecord[]) {
        for (let mutation of mutations) {
            for (let prop of this._propReferenceList) {
                (<any>mutation)[prop] = this._makeReference(
                    (<any>mutation)[prop]
                );
            }
        }

        this._helper.transaction(
            updateHtmlPortal(this.portalId, mutations as any[])
        );
    }

    // Mostly copied from https://github.com/developit/preact-worker-demo/blob/bac36d7c34b241e4c041bcbdefaef77bcc5f367e/src/renderer/worker.js#L81
    private _makeReference(obj: any): any {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(this._makeReference, this);
        }

        if (obj instanceof this._document.defaultView.Node) {
            let id = (<any>obj).__id;
            if (!id) {
                id = (<any>obj).__id = (this._idCounter++).toString();
            }
            this._nodes.set(id, obj);
        }

        let result = {} as any;
        for (let prop in obj) {
            if (obj.hasOwnProperty(prop) && !this._propDenylist.has(prop)) {
                result[prop] = (<any>obj)[prop];
            }
        }

        if (result.childNodes && result.childNodes.length) {
            result.childNodes = this._makeReference(result.childNodes);
        }

        return result;
    }
}