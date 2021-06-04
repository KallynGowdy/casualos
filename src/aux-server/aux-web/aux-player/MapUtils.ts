import type EsriConfig from 'esri/config';
import type EsriSceneView from 'esri/views/SceneView';
import type EsriExternalRenderers from 'esri/views/3d/externalRenderers';
import type EsriSpatialReference from 'esri/geometry/SpatialReference';
import type EsriMap from 'esri/Map';
import type EsriBasemap from 'esri/Basemap';
import type EsriWebMercatorUtils from 'esri/geometry/support/webMercatorUtils';
import { loadModules as loadEsriModules } from 'esri-loader';

let GeoMap: typeof EsriMap;
let SceneView: typeof EsriSceneView;
let ExternalRenderers: typeof EsriExternalRenderers;
let SpatialReference: typeof EsriSpatialReference;
let WebMercatorUtils: typeof EsriWebMercatorUtils;
let Basemap: typeof EsriBasemap;
let Config: typeof EsriConfig;
let mapLibrariesLoaded = false;

export async function loadMapModules() {
    if (mapLibrariesLoaded) {
        return;
    }
    const [
        config,
        map,
        basemap,
        sceneView,
        externalRenderers,
        spatialReference,
        webMercatorUtils,
    ] = await (loadEsriModules([
        'esri/config',
        'esri/Map',
        'esri/Basemap',
        'esri/views/SceneView',
        'esri/views/3d/externalRenderers',
        'esri/geometry/SpatialReference',
        'esri/geometry/support/webMercatorUtils',
    ]) as Promise<
        [
            typeof EsriConfig,
            typeof EsriMap,
            typeof EsriBasemap,
            typeof EsriSceneView,
            typeof EsriExternalRenderers,
            typeof EsriSpatialReference,
            typeof EsriWebMercatorUtils
        ]
    >);
    mapLibrariesLoaded = true;
    Config = config;
    GeoMap = map;
    Basemap = basemap;
    SceneView = sceneView;
    ExternalRenderers = externalRenderers;
    SpatialReference = spatialReference;
    WebMercatorUtils = webMercatorUtils;
}

export {
    Config,
    GeoMap,
    Basemap,
    SceneView,
    SpatialReference,
    WebMercatorUtils,
    mapLibrariesLoaded,
    ExternalRenderers,
};
