import type { RequestHandler } from 'express';

const cookieController = {
  setSSIDCookie: ((req, res, next) => {
    const userId = res.locals?.user?._id;
    if (!userId) {
      const error = Object.assign(new Error('Missing user id'), {
        status: 400,
      });
      return next(error);
    }
    res.cookie('ssid', String(userId), { httpOnly: true });
    return next();
  }) as RequestHandler,
};

export default cookieController;
