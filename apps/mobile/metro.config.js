const {getDefaultConfig,mergeConfig}=require('@react-native/metro-config');
const {FileStore}=require('metro-cache');
const path=require('node:path');
const workspaceRoot=path.resolve(__dirname,'../..');
const cacheDirectory=path.join(__dirname,'.metro-cache','file-map');
require('node:fs').mkdirSync(cacheDirectory,{recursive:true});
module.exports=mergeConfig(getDefaultConfig(__dirname),{
  watchFolders:[workspaceRoot],
  fileMapCacheDirectory:cacheDirectory,
  cacheStores:[new FileStore({root:path.join(__dirname,'.metro-cache','transforms')})],
  resolver:{nodeModulesPaths:[path.join(workspaceRoot,'node_modules')],unstable_enablePackageExports:true},
});
