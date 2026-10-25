import { createFavoritesApi } from '@whitepoint/utils/favorites'
import { requestJson } from './client'

export const { fetchUserFavoritePaths, saveUserFavoritePaths } = createFavoritesApi(requestJson)
