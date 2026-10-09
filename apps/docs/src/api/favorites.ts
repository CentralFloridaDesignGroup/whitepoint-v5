import { createFavoritesApi } from '@whitepoint/utils'
import { requestJson } from './client'

export const { fetchUserFavoritePaths, saveUserFavoritePaths } = createFavoritesApi(requestJson)