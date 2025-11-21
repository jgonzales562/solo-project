import type { RequestHandler } from 'express';

const cookieController = {
  setSSIDCookie: ((req, res, next) => {
    const userId = (res.locals as any)?.user?._id || (req as any)?.user?._id;
    if (!userId) {
      return next({
        log: 'cookieController.setSSIDCookie: no user id',
        status: 400,
        message: { err: 'Missing user id' },
      });
    }
    res.cookie('ssid', String(userId), { httpOnly: true });
    return next();
  }) as RequestHandler,
};

export default cookieController;
