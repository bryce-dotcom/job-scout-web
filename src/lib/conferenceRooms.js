// Conference rooms — re-export shim.
//
// The implementation lives in supabase/functions/_shared/conferenceRooms.ts
// so the app and the token function share ONE copy, the way
// materialLaborSplit and signatureTargets do.
//
// It matters more here than usual: `roomId` is the tenant boundary. The
// browser asks for a slug and the SERVER decides which company's room that
// is, from the caller's JWT. If the two sides ever disagreed about how a
// room id is built, one company could end up in another's call — so there is
// one definition and both read it.
//
// Add to the core, never here.

export {
  MAIN_ROOM,
  ROOM_NAMES,
  FIRESIDE_PREFIX,
  fireSideName,
  fireSideSlug,
  nextRoomName,
  roomMeta,
  roomId,
  parseRoomId,
  occupancyLabel,
} from '../../supabase/functions/_shared/conferenceRooms.ts'
